import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "assets/brand/rosarium-logo.png");
const black = { r: 9, g: 8, b: 6, alpha: 1 };
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

await access(source);

async function icon(path, size, padding = 0) {
  await mkdir(dirname(path), { recursive: true });
  const inner = Math.round(size * (1 - padding * 2));
  const mark = await sharp(source)
    .resize(inner, inner, { fit: "contain", background: black })
    .png()
    .toBuffer();

  await sharp({ create: { width: size, height: size, channels: 4, background: black } })
    .composite([{ input: mark, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(path);
}

async function transparentMark(path, size, padding = 0) {
  await mkdir(dirname(path), { recursive: true });
  const inner = Math.round(size * (1 - padding * 2));
  const mark = await sharp(source)
    .resize(inner, inner, { fit: "contain", background: transparent })
    .png()
    .toBuffer();

  await sharp({ create: { width: size, height: size, channels: 4, background: transparent } })
    .composite([{ input: mark, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(path);
}

async function splash(path, width, height) {
  await mkdir(dirname(path), { recursive: true });
  const markSize = Math.round(Math.min(width, height) * 0.48);
  const mark = await sharp(source).resize(markSize, markSize, { fit: "contain", background: black }).png().toBuffer();
  await sharp({ create: { width, height, channels: 4, background: black } })
    .composite([{ input: mark, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(path);
}

const webIcons = [
  ["www/assets/icons/icon-192.png", 192, 0.04],
  ["www/assets/icons/icon-512.png", 512, 0.04],
  ["www/assets/icons/icon-maskable-512.png", 512, 0.12],
  ["www/assets/icons/apple-touch-icon.png", 180, 0.08]
];

for (const [path, size, padding] of webIcons) await icon(resolve(root, path), size, padding);
await transparentMark(resolve(root, "www/assets/brand/rosarium-mark.png"), 512, 0.03);

const androidRoot = resolve(root, "android/app/src/main/res");
try {
  await access(resolve(root, "android"));
  const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [density, size] of Object.entries(densities)) {
    const folder = resolve(androidRoot, `mipmap-${density}`);
    await icon(resolve(folder, "ic_launcher.png"), size, 0.08);
    await icon(resolve(folder, "ic_launcher_round.png"), size, 0.13);
    await icon(resolve(folder, "ic_launcher_foreground.png"), Math.round(size * 2.25), 0.22);
  }
  await writeFile(resolve(androidRoot, "values/ic_launcher_background.xml"), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#090806</color>\n</resources>\n');
  await writeFile(resolve(androidRoot, "values/colors.xml"), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="colorPrimary">#090806</color>\n    <color name="colorPrimaryDark">#090806</color>\n    <color name="colorAccent">#C6A15B</color>\n    <color name="rosarium_black">#090806</color>\n</resources>\n');
  await writeFile(resolve(androidRoot, "values/styles.xml"), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
        <item name="android:statusBarColor">@color/rosarium_black</item>
        <item name="android:navigationBarColor">@color/rosarium_black</item>
        <item name="android:windowLightStatusBar">false</item>
        <item name="android:windowLightNavigationBar">false</item>
    </style>
    <style name="AppTheme.NoActionBar" parent="AppTheme">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@color/rosarium_black</item>
    </style>
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:background">@drawable/splash</item>
        <item name="windowSplashScreenBackground">@color/rosarium_black</item>
        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
    </style>
</resources>
`);

  const splashSizes = {
    "drawable/splash.png": [480, 320],
    "drawable-port-mdpi/splash.png": [320, 480],
    "drawable-port-hdpi/splash.png": [480, 800],
    "drawable-port-xhdpi/splash.png": [720, 1280],
    "drawable-port-xxhdpi/splash.png": [960, 1600],
    "drawable-port-xxxhdpi/splash.png": [1280, 1920],
    "drawable-land-mdpi/splash.png": [480, 320],
    "drawable-land-hdpi/splash.png": [800, 480],
    "drawable-land-xhdpi/splash.png": [1280, 720],
    "drawable-land-xxhdpi/splash.png": [1600, 960],
    "drawable-land-xxxhdpi/splash.png": [1920, 1280]
  };
  for (const [path, [width, height]] of Object.entries(splashSizes)) await splash(resolve(androidRoot, path), width, height);
  console.log("Ícones e telas de abertura Android atualizados.");
} catch {
  console.log("Plataforma Android ainda não existe; ícones web gerados.");
}
