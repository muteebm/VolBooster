Add-Type -AssemblyName System.Drawing

function Save-IconPng([int]$size, [string]$outPath) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $s = $size / 32.0
  $bg = [System.Drawing.Color]::FromArgb(255, 7, 8, 12)
  $accent = [System.Drawing.Color]::FromArgb(255, 125, 211, 252)
  $ring = [System.Drawing.Color]::FromArgb(72, 125, 211, 252)

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $r = 8 * $s
  $rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
  $d = $r * 2
  $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush $bg), $path)

  $penRing = New-Object System.Drawing.Pen $ring, (1.1 * $s)
  $inset = 1.1 * $s
  $inner = New-Object System.Drawing.RectangleF $inset, $inset, ($size - 2 * $inset), ($size - 2 * $inset)
  $ir = 6.9 * $s
  $id = $ir * 2
  $ringPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $ringPath.AddArc($inner.X, $inner.Y, $id, $id, 180, 90)
  $ringPath.AddArc($inner.Right - $id, $inner.Y, $id, $id, 270, 90)
  $ringPath.AddArc($inner.Right - $id, $inner.Bottom - $id, $id, $id, 0, 90)
  $ringPath.AddArc($inner.X, $inner.Bottom - $id, $id, $id, 90, 90)
  $ringPath.CloseFigure()
  $g.DrawPath($penRing, $ringPath)

  $ceil = New-Object System.Drawing.Pen $accent, (1.5 * $s)
  $ceil.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $ceil.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawLine($ceil, 7 * $s, 10.2 * $s, 25 * $s, 10.2 * $s)

  $bars = @(
    @{ X = 8.1; Y = 18.2; H = 7.6; A = 128 },
    @{ X = 12.3; Y = 14.4; H = 11.4; A = 199 },
    @{ X = 16.5; Y = 12.1; H = 13.7; A = 255 },
    @{ X = 20.7; Y = 15.8; H = 10.0; A = 173 }
  )
  $w = 2.3 * $s
  $rr = 1.05 * $s
  foreach ($bar in $bars) {
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($bar.A, 125, 211, 252))
    $bx = $bar.X * $s
    $by = $bar.Y * $s
    $bh = $bar.H * $s
    $bp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $bd = [Math]::Min($rr * 2, [Math]::Min($w, $bh))
    $bp.AddArc($bx, $by, $bd, $bd, 180, 90)
    $bp.AddArc($bx + $w - $bd, $by, $bd, $bd, 270, 90)
    $bp.AddArc($bx + $w - $bd, $by + $bh - $bd, $bd, $bd, 0, 90)
    $bp.AddArc($bx, $by + $bh - $bd, $bd, $bd, 90, 90)
    $bp.CloseFigure()
    $g.FillPath($brush, $bp)
    $brush.Dispose()
    $bp.Dispose()
  }

  $dir = Split-Path $outPath
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  $path.Dispose()
  $ringPath.Dispose()
  $penRing.Dispose()
  $ceil.Dispose()
}

$root = Split-Path $PSScriptRoot -Parent
$res = Join-Path $root 'resources'
Save-IconPng 256 (Join-Path $res 'icon.png')

$temp = Join-Path $env:TEMP 'headroom-icon'
New-Item -ItemType Directory -Force -Path $temp | Out-Null
$pngs = @()
foreach ($size in 16, 24, 32, 48, 64, 128, 256) {
  $p = Join-Path $temp "icon-$size.png"
  Save-IconPng $size $p
  $pngs += $p
}

function Save-Ico([string[]]$pngFiles, [string]$outPath) {
  $blobs = New-Object System.Collections.Generic.List[object]
  foreach ($file in $pngFiles) {
    $bytes = [IO.File]::ReadAllBytes($file)
    $img = [System.Drawing.Image]::FromFile($file)
    $blobs.Add(@{ W = $img.Width; H = $img.Height; Data = $bytes }) | Out-Null
    $img.Dispose()
  }
  $ms = New-Object IO.MemoryStream
  $bw = New-Object IO.BinaryWriter $ms
  $bw.Write([UInt16]0)
  $bw.Write([UInt16]1)
  $bw.Write([UInt16]$blobs.Count)
  $payloadOffset = 6 + 16 * $blobs.Count
  foreach ($blob in $blobs) {
    $bw.Write([Byte]($(if ($blob.W -ge 256) { 0 } else { $blob.W })))
    $bw.Write([Byte]($(if ($blob.H -ge 256) { 0 } else { $blob.H })))
    $bw.Write([Byte]0)
    $bw.Write([Byte]0)
    $bw.Write([UInt16]1)
    $bw.Write([UInt16]32)
    $bw.Write([UInt32]$blob.Data.Length)
    $bw.Write([UInt32]$payloadOffset)
    $payloadOffset += $blob.Data.Length
  }
  foreach ($blob in $blobs) { $bw.Write($blob.Data) }
  $bw.Flush()
  [IO.File]::WriteAllBytes($outPath, $ms.ToArray())
  $bw.Dispose()
  $ms.Dispose()
}

Save-Ico $pngs (Join-Path $res 'icon.ico')
Write-Output 'Wrote resources/icon.png and resources/icon.ico'
