import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const initialize = process.argv.includes("--init");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function runCapacitor(args) {
  run(process.execPath, [resolve(root, "node_modules/@capacitor/cli/bin/capacitor"), ...args]);
}

async function updateFile(path, transform) {
  const absolute = resolve(root, path);
  const current = await readFile(absolute, "utf8");
  const updated = transform(current);
  if (updated !== current) await writeFile(absolute, updated);
}

async function configureNativeAgenda() {
  const sourceRoot = resolve(root, "native/android");
  const javaTarget = resolve(root, "android/app/src/main/java/com/arthurmedeiros/rosarium");
  const resourceTarget = resolve(root, "android/app/src/main/res");
  await mkdir(javaTarget, { recursive: true });
  await cp(resolve(sourceRoot, "java/com/arthurmedeiros/rosarium"), javaTarget, { recursive: true, force: true });
  await cp(resolve(sourceRoot, "MainActivity.java"), resolve(javaTarget, "MainActivity.java"), { force: true });
  await cp(resolve(sourceRoot, "res"), resourceTarget, { recursive: true, force: true });

  await updateFile("android/build.gradle", (content) => content.includes("kotlin-gradle-plugin") ? content : content.replace(
    "classpath 'com.google.gms:google-services:4.4.4'",
    "classpath 'com.google.gms:google-services:4.4.4'\n        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.21'"
  ));

  const packageData = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const [major, minor, patch] = packageData.version.split(".").map((part) => Number(part) || 0);
  const versionCode = major * 10000 + minor * 100 + patch;
  await updateFile("android/app/build.gradle", (content) => {
    let updated = content.includes("org.jetbrains.kotlin.android") ? content : content.replace(
      "apply plugin: 'com.android.application'",
      "apply plugin: 'com.android.application'\napply plugin: 'org.jetbrains.kotlin.android'"
    );
    updated = updated.replace(/versionCode \d+/, `versionCode ${versionCode}`);
    updated = updated.replace(/versionName "[^"]+"/, `versionName "${packageData.version}"`);
    if (!updated.includes("coreLibraryDesugaringEnabled")) {
      updated = updated.replace("    buildTypes {", "    compileOptions {\n        coreLibraryDesugaringEnabled true\n        sourceCompatibility JavaVersion.VERSION_17\n        targetCompatibility JavaVersion.VERSION_17\n    }\n    kotlinOptions {\n        jvmTarget = '17'\n    }\n    buildTypes {");
    }
    if (!updated.includes("desugar_jdk_libs")) {
      updated = updated.replace("dependencies {", "dependencies {\n    coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs:2.1.5'");
    }
    return updated;
  });

  await updateFile("android/app/src/main/AndroidManifest.xml", (content) => {
    let updated = content;
    if (!updated.includes("AgendaReminderReceiver")) {
      updated = updated.replace("    </application>", `        <receiver
            android:name=".AgendaReminderReceiver"
            android:exported="false" />

        <receiver
            android:name=".AgendaBootReceiver"
            android:enabled="true"
            android:exported="false">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.TIME_SET" />
                <action android:name="android.intent.action.TIMEZONE_CHANGED" />
            </intent-filter>
        </receiver>
    </application>`);
    }
    if (!updated.includes("android.permission.POST_NOTIFICATIONS")) {
      updated = updated.replace(
        "    <uses-permission android:name=\"android.permission.INTERNET\" />",
        "    <uses-permission android:name=\"android.permission.INTERNET\" />\n    <uses-permission android:name=\"android.permission.POST_NOTIFICATIONS\" />\n    <uses-permission android:name=\"android.permission.RECEIVE_BOOT_COMPLETED\" />"
      );
    }
    return updated;
  });
}

let androidExists = true;
try { await access(resolve(root, "android")); } catch { androidExists = false; }

if (!androidExists) {
  if (!initialize) {
    console.error("A plataforma Android não existe. Execute npm run android:init.");
    process.exit(1);
  }
  runCapacitor(["add", "android"]);
}

runCapacitor(["sync", "android"]);
await configureNativeAgenda();
run("node", ["scripts/generate-assets.mjs"]);

console.log("Projeto Android sincronizado com a interface, identidade visual e integração Kotlin da Agenda.");
