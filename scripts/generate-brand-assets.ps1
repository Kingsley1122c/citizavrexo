Add-Type -AssemblyName System.Drawing

function New-RoundedRectanglePath {
  param(
    [single]$X,
    [single]$Y,
    [single]$Width,
    [single]$Height,
    [single]$Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Draw-CitizavrexoMark {
  param(
    [System.Drawing.Graphics]$Graphics,
    [single]$X,
    [single]$Y,
    [single]$Size,
    [bool]$WithTile = $true,
    [bool]$DarkSurface = $true
  )

  $state = $Graphics.Save()
  $Graphics.TranslateTransform($X, $Y)
  $Graphics.ScaleTransform($Size / 64, $Size / 64)

  $navyBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(9, 28, 51))
  $ivoryBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(244, 248, 251))
  $goldBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(216, 181, 106))
  $tealPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(24, 198, 177), 3)
  $tealPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Square
  $tealPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Square

  if ($WithTile) {
    $tile = New-RoundedRectanglePath -X 0 -Y 0 -Width 64 -Height 64 -Radius 14
    $Graphics.FillPath($navyBrush, $tile)
    $tile.Dispose()
  }

  $markPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $markPath.StartFigure()
  $markPath.AddLine(51, 8, 25, 8)
  $markPath.AddBezier(25, 8, 15.61, 8, 8, 15.61, 8, 25)
  $markPath.AddLine(8, 25, 8, 39)
  $markPath.AddBezier(8, 39, 8, 48.39, 15.61, 56, 25, 56)
  $markPath.AddLine(25, 56, 51, 56)
  $markPath.AddLine(51, 56, 43, 44)
  $markPath.AddLine(43, 44, 26, 44)
  $markPath.AddBezier(26, 44, 22.69, 44, 20, 41.31, 20, 38)
  $markPath.AddLine(20, 38, 20, 26)
  $markPath.AddBezier(20, 26, 20, 22.69, 22.69, 20, 26, 20)
  $markPath.AddLine(26, 20, 43, 20)
  $markPath.CloseFigure()
  $Graphics.FillPath($(if ($DarkSurface -or $WithTile) { $ivoryBrush } else { $navyBrush }), $markPath)

  $rail = New-Object System.Drawing.Drawing2D.GraphicsPath
  $rail.AddLine(26, 15, 25, 15)
  $rail.AddBezier(25, 15, 18.92, 15, 14, 19.92, 14, 26)
  $rail.AddLine(14, 26, 14, 38)
  $rail.AddBezier(14, 38, 14, 44.08, 18.92, 49, 25, 49)
  $rail.AddLine(25, 49, 26, 49)
  $Graphics.DrawPath($tealPen, $rail)

  $Graphics.FillPolygon($goldBrush, [System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF(46, 8)),
    (New-Object System.Drawing.PointF(51, 8)),
    (New-Object System.Drawing.PointF(43, 20)),
    (New-Object System.Drawing.PointF(38, 20))
  ))
  $Graphics.FillPolygon($goldBrush, [System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF(38, 44)),
    (New-Object System.Drawing.PointF(43, 44)),
    (New-Object System.Drawing.PointF(51, 56)),
    (New-Object System.Drawing.PointF(46, 56))
  ))

  $markPath.Dispose(); $rail.Dispose(); $tealPen.Dispose()
  $navyBrush.Dispose(); $ivoryBrush.Dispose(); $goldBrush.Dispose()
  $Graphics.Restore($state)
}

function New-CitizavrexoBitmap {
  param(
    [int]$IconSize,
    [string]$OutputPath
  )

  $bitmap = New-Object System.Drawing.Bitmap($IconSize, $IconSize)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)
  Draw-CitizavrexoMark -Graphics $graphics -X 0 -Y 0 -Size $IconSize
  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $graphics.Dispose(); $bitmap.Dispose()
}

$iconDir = "public/icons"
if (-not (Test-Path $iconDir)) {
  New-Item -ItemType Directory -Path $iconDir | Out-Null
}

New-CitizavrexoBitmap -IconSize 32 -OutputPath (Join-Path $iconDir "favicon-32.png")
New-CitizavrexoBitmap -IconSize 48 -OutputPath (Join-Path $iconDir "favicon-48.png")
New-CitizavrexoBitmap -IconSize 180 -OutputPath (Join-Path $iconDir "apple-touch-icon.png")
New-CitizavrexoBitmap -IconSize 192 -OutputPath (Join-Path $iconDir "android-chrome-192x192.png")
New-CitizavrexoBitmap -IconSize 512 -OutputPath (Join-Path $iconDir "android-chrome-512x512.png")

$og = New-Object System.Drawing.Bitmap(1200, 630)
$graphics = [System.Drawing.Graphics]::FromImage($og)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(9, 28, 51))

$gridPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(25, 244, 248, 251), 1)
for ($x = 760; $x -le 1120; $x += 60) { $graphics.DrawLine($gridPen, $x, 72, $x, 558) }
for ($y = 78; $y -le 558; $y += 60) { $graphics.DrawLine($gridPen, 700, $y, 1140, $y) }

Draw-CitizavrexoMark -Graphics $graphics -X 90 -Y 120 -Size 150 -WithTile $false -DarkSurface $true

$fontTitle = New-Object System.Drawing.Font("Segoe UI", 70, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fontSub = New-Object System.Drawing.Font("Segoe UI", 30, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$fontTag = New-Object System.Drawing.Font("Segoe UI", 22, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(244, 248, 251))
$mutedBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(167, 190, 205))
$tealBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(24, 198, 177))
$goldBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(216, 181, 106))

$graphics.DrawString("CITIZAVREXO", $fontTitle, $whiteBrush, 285, 132)
$graphics.DrawString("Premium financial technology", $fontSub, $mutedBrush, 289, 229)
$graphics.DrawString("TRUST. CLARITY. MOMENTUM.", $fontTag, $tealBrush, 291, 293)
$graphics.FillRectangle($goldBrush, 291, 342, 170, 6)
$graphics.DrawString("citizavrexo.com", $fontSub, $whiteBrush, 90, 520)

$og.Save("public/brand/og-citizavrexo.png", [System.Drawing.Imaging.ImageFormat]::Png)

$fontTitle.Dispose(); $fontSub.Dispose(); $fontTag.Dispose()
$whiteBrush.Dispose(); $mutedBrush.Dispose(); $tealBrush.Dispose(); $goldBrush.Dispose()
$gridPen.Dispose(); $graphics.Dispose(); $og.Dispose()
