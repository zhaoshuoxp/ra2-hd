$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$result = [ordered]@{ schemaVersion = 1; status = 'PASS'; errors = @() }
try {
    $result.cpu = @(Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed)
    $result.gpuAdapters = @(Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, DriverDate, VideoProcessor, AdapterRAM)
    $system = Get-CimInstance Win32_ComputerSystem
    $result.memoryBytes = $system.TotalPhysicalMemory
    $result.model = $system.Model
    $result.manufacturer = $system.Manufacturer
    $result.os = Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture
    $result.powerScheme = (& powercfg.exe /GETACTIVESCHEME | Out-String).Trim()
    $result.batteries = @(Get-CimInstance Win32_Battery | Select-Object BatteryStatus, EstimatedChargeRemaining)
} catch { $result.status = 'PARTIAL'; $result.errors += $_.Exception.GetType().FullName }
$result.adapterRamInterpretation = 'Raw WMI field only; may truncate or misreport capacity. Not actual process VRAM or a DXGI budget.'
$result.actualDedicatedVramBytes = 'UNAVAILABLE'
$result.gameProcessGpuBudget = 'UNAVAILABLE'
$result | ConvertTo-Json -Depth 8
