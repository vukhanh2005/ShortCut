Add-Type -AssemblyName System.Drawing
$outputDir = Join-Path $PSScriptRoot '..\assets'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$bitmap = New-Object System.Drawing.Bitmap 256,256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear([System.Drawing.Color]::Transparent)
$mint = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(169,237,183))
$ink = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(22,39,28))
$points = [System.Drawing.Point[]]@((New-Object System.Drawing.Point 32,8),(New-Object System.Drawing.Point 248,8),(New-Object System.Drawing.Point 248,224),(New-Object System.Drawing.Point 224,248),(New-Object System.Drawing.Point 8,248),(New-Object System.Drawing.Point 8,32))
$graphics.FillPolygon($mint,$points)
$font = New-Object System.Drawing.Font 'Bahnschrift',136,([System.Drawing.FontStyle]::Bold),([System.Drawing.GraphicsUnit]::Pixel)
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$graphics.DrawString('S/',$font,$ink,(New-Object System.Drawing.RectangleF 0,4,256,256),$format)
$stream = New-Object System.IO.MemoryStream
$bitmap.Save($stream,[System.Drawing.Imaging.ImageFormat]::Png)
$png = $stream.ToArray()
[System.IO.File]::WriteAllBytes((Join-Path $outputDir 'icon.png'),$png)
$icon = [System.IO.File]::Create((Join-Path $outputDir 'icon.ico'))
$writer = New-Object System.IO.BinaryWriter $icon
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
$writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
$writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$png.Length); $writer.Write([uint32]22); $writer.Write($png)
$writer.Dispose(); $stream.Dispose(); $graphics.Dispose(); $bitmap.Dispose(); $font.Dispose(); $format.Dispose(); $mint.Dispose(); $ink.Dispose()
