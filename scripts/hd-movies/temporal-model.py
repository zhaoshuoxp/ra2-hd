"""Inference-only adapter for pinned Apache-2.0 OpenMMLab RealBasicVSR classes."""
# Copyright (c) OpenMMLab. All rights reserved.
# Adapter: replace registry/training infrastructure with equivalent torch modules.
# Upstream: open-mmlab/mmagic at 0a560bba9b79ebe78574e1d4cbbdd0e798e63568.
import ast
import hashlib
import types
from pathlib import Path
import torch
from torch import nn
import torch.nn.functional as F

class ConvModule(nn.Module):
    def __init__(self, in_channels, out_channels, kernel_size, stride, padding, norm_cfg=None, act_cfg=None):
        super().__init__()
        assert norm_cfg is None
        self.conv = nn.Conv2d(in_channels, out_channels, kernel_size, stride, padding, bias=True)
        self.activation = nn.ReLU(inplace=True) if act_cfg is not None else nn.Identity()

    def forward(self, value):
        return self.activation(self.conv(value))

class ResidualBlockNoBN(nn.Module):
    def __init__(self, mid_channels=64, res_scale=1.0):
        super().__init__()
        self.res_scale = res_scale
        self.conv1 = nn.Conv2d(mid_channels, mid_channels, 3, 1, 1, bias=True)
        self.conv2 = nn.Conv2d(mid_channels, mid_channels, 3, 1, 1, bias=True)
        self.relu = nn.ReLU(inplace=True)

    def forward(self, value):
        return value + self.conv2(self.relu(self.conv1(value))) * self.res_scale

class PixelShufflePack(nn.Module):
    def __init__(self, in_channels, out_channels, scale_factor, upsample_kernel):
        super().__init__()
        self.scale_factor = scale_factor
        self.upsample_conv = nn.Conv2d(in_channels, out_channels * scale_factor ** 2, upsample_kernel,
                                       padding=(upsample_kernel - 1) // 2)

    def forward(self, value):
        return F.pixel_shuffle(self.upsample_conv(value), self.scale_factor)

def make_layer(block, num_blocks, **kwargs):
    return nn.Sequential(*(block(**kwargs) for _ in range(num_blocks)))

def flow_warp(value, flow, interpolation='bilinear', padding_mode='zeros', align_corners=True):
    assert value.shape[-2:] == flow.shape[1:3]
    _, _, height, width = value.shape
    y, x = torch.meshgrid(torch.arange(height, device=value.device, dtype=value.dtype),
                          torch.arange(width, device=value.device, dtype=value.dtype), indexing='ij')
    grid = torch.stack((x, y), dim=2) + flow
    normalized = torch.stack((2 * grid[..., 0] / max(width - 1, 1) - 1,
                              2 * grid[..., 1] / max(height - 1, 1) - 1), dim=3)
    return F.grid_sample(value, normalized.to(value.dtype), mode=interpolation,
                         padding_mode=padding_mode, align_corners=align_corners)

def offloaded_basicvsr(self, lrs):
    """Preserve the full sequence and float32 graph while storing completed features on CPU."""
    n, frames, _, height, width = lrs.shape
    self.check_if_mirror_extended(lrs)
    forward_flow, backward_flow = self.compute_flow(lrs)
    if lrs.device.type == 'mps':
        torch.mps.synchronize(); torch.mps.empty_cache()
    reverse = [None] * frames
    consumer = getattr(self, '_frame_consumer', None)
    feature = lrs.new_zeros(n, self.mid_channels, height, width)
    for index in range(frames - 1, -1, -1):
        if index < frames - 1:
            feature = flow_warp(feature, backward_flow[:, index].permute(0, 2, 3, 1))
        feature = self.backward_resblocks(torch.cat([lrs[:, index], feature], dim=1))
        reverse[index] = feature.cpu()
    result = None if consumer else torch.empty((n, frames, 3, height * 4, width * 4), dtype=lrs.dtype, device='cpu')
    feature = torch.zeros_like(feature)
    for index in range(frames):
        current = lrs[:, index]
        if index > 0:
            flow = forward_flow[:, index - 1] if forward_flow is not None else backward_flow[:, -index]
            feature = flow_warp(feature, flow.permute(0, 2, 3, 1))
        feature = self.forward_resblocks(torch.cat([current, feature], dim=1))
        value = torch.cat([reverse[index].to(lrs.device), feature], dim=1)
        value = self.lrelu(self.fusion(value))
        value = self.lrelu(self.upsample1(value))
        value = self.lrelu(self.upsample2(value))
        value = self.lrelu(self.conv_hr(value))
        value = self.conv_last(value) + self.img_upsample(current)
        if consumer:
            consumer(index, value.cpu(), current.cpu())
        else:
            result[:, index].copy_(value.cpu())
        reverse[index] = None
    return result

def load_network(source_directory, checkpoint, device='mps', refine_threshold=255, cpu_offload=False,
                 reconstruction_checkpoint=None, perceptual_weight=1.0):
    namespace = dict(torch=torch, nn=nn, F=F, BaseModule=nn.Module, ConvModule=ConvModule,
                     ResidualBlockNoBN=ResidualBlockNoBN, PixelShufflePack=PixelShufflePack,
                     make_layer=make_layer, flow_warp=flow_warp, WARNING=30,
                     print_log=lambda message, *args: print(message, flush=True))
    expected = {
        'basicvsr_net.py': {'BasicVSRNet', 'ResidualBlocksWithInputConv', 'SPyNet', 'SPyNetBasicModule'},
        'real_basicvsr_net.py': {'RealBasicVSRNet'},
    }
    hashes = {
        'basicvsr_net.py': 'fbe7f1c5add38df66458a54ed4d6f1da9ef623708705a97e026a72453f9ec8a0',
        'real_basicvsr_net.py': '9b66b81031e2dc196eaadd4877d56aedda181efe50051222bd1cb275d3efdfaf',
    }
    for name, names in expected.items():
        source = Path(source_directory) / name
        assert hashlib.sha256(source.read_bytes()).hexdigest() == hashes[name], 'Pinned upstream source differs'
        parsed = ast.parse(source.read_text(), filename=str(source))
        classes = [node for node in parsed.body if isinstance(node, ast.ClassDef) and node.name in names]
        assert {node.name for node in classes} == names
        for node in classes:
            node.decorator_list = []
        module = ast.fix_missing_locations(ast.Module(body=classes, type_ignores=[]))
        exec(compile(module, str(source), 'exec'), namespace)
    network = namespace['RealBasicVSRNet'](mid_channels=64, num_propagation_blocks=20,
                                          num_cleaning_blocks=20, dynamic_refine_thres=refine_threshold,
                                          spynet_pretrained=None, is_sequential_cleaning=True)
    loaded = torch.load(checkpoint, map_location='cpu', weights_only=True)['state_dict']
    prefix = 'generator_ema.' if any(key.startswith('generator_ema.') for key in loaded) else 'generator.'
    weights = {key[len(prefix):]: value for key, value in loaded.items() if key.startswith(prefix)}
    assert len(weights) == 320, 'Unexpected official inference checkpoint layout'
    assert 0 <= perceptual_weight <= 1
    reconstruction_prefix = None
    if perceptual_weight != 1:
        assert reconstruction_checkpoint is not None, 'Reconstruction weights are required'
        reconstruction = torch.load(reconstruction_checkpoint, map_location='cpu', weights_only=True)['state_dict']
        reconstruction_prefix = 'generator_ema.' if any(key.startswith('generator_ema.') for key in reconstruction) else 'generator.'
        reconstruction = {key[len(reconstruction_prefix):]: value for key, value in reconstruction.items()
                          if key.startswith(reconstruction_prefix)}
        assert reconstruction.keys() == weights.keys(), 'Network interpolation requires identical keys'
        for key in weights:
            assert weights[key].shape == reconstruction[key].shape and weights[key].dtype == reconstruction[key].dtype
        weights = {key: torch.lerp(reconstruction[key], value, perceptual_weight) for key, value in weights.items()}
    network.load_state_dict(weights, strict=True)
    if cpu_offload:
        network.basicvsr.forward = types.MethodType(offloaded_basicvsr, network.basicvsr)
    return network.eval().to(device), dict(prefix=prefix, parameters=len(weights), strict=True,
                                           refineThreshold=refine_threshold, sequentialCleaning=True, cpuOffload=cpu_offload,
                                           perceptualWeight=perceptual_weight, reconstructionPrefix=reconstruction_prefix)
