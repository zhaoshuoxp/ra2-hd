"""Cover component images in the shared actor coordinate system."""

import math


def cover_registered_frames(parts):
    # Match Coords' fixed isometric camera, without changing any image pivot.
    alpha, beta = math.pi / 6, math.pi / 4
    scale = math.cos(beta) * 256 / 30
    bounds = {}
    for part in parts:
        actor = part["actor"]
        old = part.get("depthBounds")
        if old:
            bounds.setdefault(actor, list(old))
        for frame in part["frames"]:
            x, y, z = frame.get("referenceOrigin", [0, 0, 0])
            screen_x = math.cos(beta) * x - math.sin(beta) * z
            screen_y = math.cos(alpha) * y - math.sin(alpha) * (
                math.sin(beta) * x + math.cos(beta) * z
            )
            left = frame["offset"][0] + screen_x / scale
            top = frame["offset"][1] - screen_y / scale
            width, height = frame["logicalSize"]
            image = [left - 0.25, top - 0.25, left + width + 0.25, top + height + 0.25]
            shared = bounds.setdefault(actor, image)
            bounds[actor] = [
                min(shared[0], image[0]), min(shared[1], image[1]),
                max(shared[2], image[2]), max(shared[3], image[3]),
            ]
    for part in parts:
        part["depthBounds"] = list(bounds[part["actor"]])
    return bounds
