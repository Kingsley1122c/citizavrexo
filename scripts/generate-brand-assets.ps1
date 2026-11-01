Add-Type -AssemblyName System.Drawing

function New-CitizavrexoBitmap {
  param(
    [int]$IconSize,
    [string]$OutputPath
  )

  $bmp = New-Object System.Drawing.Bitmap($IconSize, $IconSize)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::FromArgb(9, 28, 51))

  $pad = [int]($IconSize * 0.08)
  $stroke = [Math]::Max(2, [int]($IconSize * 0.06))
  $radius = [Math]::Max(6, [int]($IconSize * 0.22))

  $inner = [int]($IconSize - ($pad * 2))
  $rect = New-Object System.Drawing.Rectangle -ArgumentList $pad, $pad, $inner, $inner
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $path.CloseFigure()

  $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(26, 50, 82), [Math]::Max(1, [int]($IconSize * 0.018)))
  $g.DrawPath($borderPen, $path)

  $teal = [System.Drawing.Color]::FromArgb(24, 198, 177)
  $tealDark = [System.Drawing.Color]::FromArgb(15, 157, 150)
  $gold = [System.Drawing.Color]::FromArgb(216, 181, 106)
  $gradBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.Point(0, 0)), (New-Object System.Drawing.Point($IconSize, $IconSize)), $teal, $tealDark)

  $curvePen = New-Object System.Drawing.Pen($gradBrush, $stroke)
  $curvePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $curvePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

  $p1 = New-Object System.Drawing.PointF -ArgumentList ([single]($IconSize * 0.29)), ([single]($IconSize * 0.62))
  $p2 = New-Object System.Drawing.PointF -ArgumentList ([single]($IconSize * 0.43)), ([single]($IconSize * 0.39))
  $p3 = New-Object System.Drawing.PointF -ArgumentList ([single]($IconSize * 0.66)), ([single]($IconSize * 0.39))
  $g.DrawBezier($curvePen, $p1, $p2, $p2, $p3)

  $goldPen = New-Object System.Drawing.Pen($gold, [Math]::Max(2, [int]($IconSize * 0.038)))
  $goldPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $goldPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawLine($goldPen, ([single]($IconSize * 0.66)), ([single]($IconSize * 0.39)), ([single]($IconSize * 0.60)), ([single]($IconSize * 0.33)))
  $g.DrawLine($goldPen, ([single]($IconSize * 0.66)), ([single]($IconSize * 0.39)), ([single]($IconSize * 0.60)), ([single]($IconSize * 0.45)))

  $dotR = [Math]::Max(2, [int]($IconSize * 0.072))
  $goldBrush = New-Object System.Drawing.SolidBrush($gold)
  $tealBrush = New-Object System.Drawing.SolidBrush($teal)
  $g.FillEllipse($goldBrush, ([single]($IconSize * 0.25 - $dotR)), ([single]($IconSize * 0.62 - $dotR)), ([single]($dotR * 2)), ([single]($dotR * 2)))
  $g.FillEllipse($tealBrush, ([single]($IconSize * 0.68 - $dotR)), ([single]($IconSize * 0.62 - $dotR)), ([single]($dotR * 2)), ([single]($dotR * 2)))

  $bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $curvePen.Dispose(); $goldPen.Dispose(); $goldBrush.Dispose(); $tealBrush.Dispose()
  $borderPen.Dispose(); $gradBrush.Dispose(); $path.Dispose(); $g.Dispose(); $bmp.Dispose()
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

$ogDir = "public/brand"
$og = New-Object System.Drawing.Bitmap(1200, 630)
$g = [System.Drawing.Graphics]::FromImage($og)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.Point(0, 0)), (New-Object System.Drawing.Point(1200, 630)), ([System.Drawing.Color]::FromArgb(7, 24, 44)), ([System.Drawing.Color]::FromArgb(12, 34, 61)))
$g.FillRectangle($bg, 0, 0, 1200, 630)

for ($i = 0; $i -lt 10; $i++) {
  $alpha = 22 - ($i * 2)
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb([Math]::Max(4, $alpha), 24, 198, 177), [Math]::Max(1, 22 - ($i * 2)))
  $g.DrawEllipse($pen, 770 + ($i * 12), 100 + ($i * 10), 380 - ($i * 24), 380 - ($i * 24))
  $pen.Dispose()
}

New-CitizavrexoBitmap -IconSize 220 -OutputPath "$ogDir/.og-mark-temp.png"
$mark = [System.Drawing.Image]::FromFile("$ogDir/.og-mark-temp.png")
$g.DrawImage($mark, 92, 104, 148, 148)
$mark.Dispose()
Remove-Item "$ogDir/.og-mark-temp.png"

$fontTitle = New-Object System.Drawing.Font("Segoe UI", 82, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fontSub = New-Object System.Drawing.Font("Segoe UI", 34, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$fontTag = New-Object System.Drawing.Font("Segoe UI", 26, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$tealBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(24, 198, 177))
$whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(241, 248, 251))
$mutedBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(167, 190, 205))
$goldBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(216, 181, 106))

$g.DrawString("CITIZAVREXO", $fontTitle, $whiteBrush, 274, 112)
$g.DrawString("Premium digital financial workspace", $fontSub, $mutedBrush, 274, 228)
$g.DrawString("SECURE. CLEAR. GLOBAL.", $fontTag, $tealBrush, 276, 296)
$g.FillRectangle($goldBrush, 276, 344, 210, 8)
$g.DrawString("citizavrexo.com", $fontSub, $whiteBrush, 92, 522)

$og.Save("$ogDir/og-citizavrexo.png", [System.Drawing.Imaging.ImageFormat]::Png)

$fontTitle.Dispose(); $fontSub.Dispose(); $fontTag.Dispose()
$tealBrush.Dispose(); $whiteBrush.Dispose(); $mutedBrush.Dispose(); $goldBrush.Dispose()
$bg.Dispose(); $g.Dispose(); $og.Dispose()
