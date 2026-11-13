# Free deployment guide

This guide covers the existing React website and the separate Expo mobile app.
It uses Cloudflare Pages for the website and Expo Application Services (EAS)
for an Android installable build. Both offer free tiers, subject to their
current limits. Check [Cloudflare Pages pricing](https://developers.cloudflare.com/pages/platform/limits/)
and [Expo pricing](https://expo.dev/pricing/) before deploying.

| What you want                             | Approach                              | Cost and limitations                                      |
| ----------------------------------------- | ------------------------------------- | --------------------------------------------------------- |
| Website on a computer or phone            | Cloudflare Pages                      | Free tier; works in a mobile browser                      |
| Android app installed on a device         | EAS Build, then install an APK        | Free EAS quota; users install the APK outside Google Play |
| iPhone app in the App Store or TestFlight | EAS Build and Apple Developer Program | Apple developer membership is paid                        |

The website can be used on both Android and iPhone without publishing a native
app. Adding the website to a phone's home screen is a browser shortcut, not an
installation of the native Expo app.

## Important: data and security

- There is no server or database. Accounts and expense data live in each
  browser or device; signing in on another device does **not** sync them.
  Clearing browser storage, uninstalling an app, or losing a device can remove
  its local data.
- Use the app's password-protected backup/export before moving devices or
  removing data. Keep the backup password separately; it cannot be recovered.
  Restore replaces the current account's data.
- A new website domain is a different browser origin, so data from localhost,
  a preview URL, or an old domain does not automatically appear on the new
  URL. Back up before changing domains.
- Cloudflare hosts the website files, not a shared account service. Avoid
  publishing secrets, backups, signing credentials, or personal data in the
  source repository. Use HTTPS and log out on shared devices.
- Browser notifications require permission and the website to be open. Native
  reminders require device permission and depend on operating-system settings.

## Prerequisites

1. Install Git and a recent Node.js LTS release (Node 22 is a suitable choice).
2. Create a GitHub account and a Cloudflare account. Create an
   [Expo account](https://expo.dev/signup) if building the Android app.
3. Open PowerShell in the project root, the directory containing the root
   `package.json`, and run:

   ```powershell
   npm.cmd install
   npm.cmd run web:build
   ```

   The build should produce `apps\web\dist\index.html`. If PowerShell permits
   npm scripts, `npm` can be used instead of `npm.cmd`.

4. Put the **entire monorepo** in a GitHub repository, including `apps`,
   `packages`, the root `package.json` and `package-lock.json`. Do not upload
   `node_modules`, generated build output, or secrets. A private GitHub
   repository can be connected to Cloudflare if access is granted.

   If this folder is not already a Git repository, initialize one from the
   project root with `git init`, then create and push a commit to your GitHub
   repository. If it is already a repository, use the existing one instead.

## Deploy the website to Cloudflare Pages

1. In the [Cloudflare dashboard](https://dash.cloudflare.com/), go to
   **Workers & Pages**, create an application, choose **Pages**, and connect
   the GitHub repository. The labels can change; choose the Git-connected
   Pages deployment rather than a Workers deployment.
2. Select the production branch. Configure the build as follows:

   | Setting                | Value                                    |
   | ---------------------- | ---------------------------------------- |
   | Framework preset       | None (or a preset with the values below) |
   | Root directory         | Repository root (leave blank or use `/`) |
   | Build command          | `npm run web:build`                      |
   | Build output directory | `apps/web/dist`                          |
   | Environment variable   | `NODE_VERSION` = `22`                    |

   Cloudflare settings use forward slashes even if you are working on Windows.
   The repository root matters: npm workspaces need the shared `packages/core`
   and root lockfile. Pages installs dependencies before running the build.
   No application-specific environment variables or backend are required.

3. Save and deploy. Open the resulting `https://<project>.pages.dev` URL.
4. Verify on a computer and a phone: open the landing page and demo, register
   a test account, add an expense, refresh, and confirm the data remains in
   that same browser. Check a hash URL such as `https://<project>.pages.dev/#/demo`
   and refresh it. The app uses hash routing, so no custom SPA rewrite is needed.
5. To release an update, push changes to the configured production branch;
   Cloudflare builds and deploys it automatically. Check the Pages deployment
   log if the build fails. Preview deployments have separate URLs and therefore
   separate browser storage.

For detailed provider settings, see the
[Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)
and [monorepo documentation](https://developers.cloudflare.com/pages/configuration/monorepos/).
An optional custom domain may have separate registration costs.

## Use the website on a phone

Open the deployed HTTPS address in the phone's browser. The layout supports
narrow screens; use the menu button to open navigation. Optionally, use the
browser's **Add to Home Screen** or equivalent action for a shortcut. Browser
support and the appearance of the shortcut vary; this project is not configured
as an installable offline PWA.

## Build and share an Android APK

An APK is a native app, separate from the website. These steps use the free EAS
build allowance; builds may queue and limits can change. They do not publish to
Google Play.

1. Ensure the entire project is in a Git repository. EAS uses the repository
   root to include the npm workspaces; see
   [EAS project uploads](https://docs.expo.dev/build-reference/project-upload/).
2. In `apps\mobile\app.json`, replace the example
   `android.package` (`com.astra0023.manageexpenses`) with a unique reverse-domain
   identifier you control, for example `com.yourorganization.manageexpenses`.
   Keep it stable after distributing the app: changing it creates a different
   app and does not migrate the existing installation's data. If building for
   iOS later, also choose a unique `ios.bundleIdentifier`.
3. From the project root, enter the mobile app directory and log in:

   ```powershell
   Set-Location apps\mobile
   npx.cmd eas-cli@latest login
   npx.cmd eas-cli@latest build:configure
   ```

   Follow the prompts to link/create the Expo project and configure builds.
   This can update `app.json` and create `eas.json` in `apps\mobile`. Review
   and save those project configuration changes in your repository. EAS commands
   for this monorepo must run from `apps\mobile`, not the repository root.

4. In `apps\mobile\eas.json`, add a `preview` profile under the existing
   `build` object, preserving the other generated settings:

   ```json
   "preview": {
     "distribution": "internal",
     "android": {
       "buildType": "apk"
     }
   }
   ```

   Make sure the surrounding JSON remains valid, including commas between
   profiles. An APK can be installed directly; the default production Android
   App Bundle (`.aab`) cannot.

5. Still in `apps\mobile`, run:

   ```powershell
   npx.cmd eas-cli@latest build --platform android --profile preview
   ```

   Follow the signing prompts; EAS can generate an Android keystore. Keep
   signing credentials secure and retain access to them: future updates must
   use the same signing key. Do not commit credentials to the repository.

6. When the build succeeds, open its Expo build-details link and download the
   APK on your Android device. Install it, allowing installation from that
   trusted source if Android asks. Only share the build link with intended
   testers; anyone with access to a shareable link may be able to download it.
   Test registration, expense entry, relaunch, backups, and reminders.
7. For updates, build another APK with the same package identifier and signing
   key, then install it over the previous version. Back up the data first. If
   Android refuses the update, do not uninstall the existing app until its data
   has been backed up and you understand why the signatures differ.

This project currently uses Expo SDK 52. Since it is an older SDK, check
[Expo's SDK support policy](https://docs.expo.dev/versions/latest/) and the
build logs if current EAS tooling or device versions reject it. A native SDK
upgrade may be necessary and is a separate change. Expo Go is a development
tool, not a deployed standalone app; current Expo Go versions may not support
this older SDK.

See Expo's [monorepo build instructions](https://docs.expo.dev/build-reference/build-with-monorepos/)
and [APK instructions](https://docs.expo.dev/build-reference/apk/) for details.

## iPhone and app stores

- **Free iPhone access:** use the deployed website in Safari. This does not
  install the Expo native app.
- **Native iOS:** App Store and TestFlight distribution require enrollment in
  the paid [Apple Developer Program](https://developer.apple.com/programs/).
  Internal device distribution also requires appropriate Apple signing and
  registered devices. See [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/).
- **Google Play:** a Play Console developer account and its registration fee
  are required. Store review and other eligibility requirements also apply.
  Use an Android App Bundle rather than the direct-install APK when preparing
  a store release. See [Google Play Console](https://play.google.com/console/about/).

## Troubleshooting

- **Cloudflare cannot resolve `@manage-expenses/core`:** confirm the entire
  repository was pushed and the Pages root directory is the repository root,
  not `apps/web`.
- **Build fails with a Node or npm error:** check the deployment log, the Node
  version setting, and that the root lockfile is committed. Build locally from
  the repository root before retrying.
- **Website opens but data seems missing:** check the exact domain and browser.
  Local accounts are not shared across browsers, devices, domains, or preview
  deployments. Restore a backup if appropriate.
- **Android build fails:** inspect the linked EAS build log, verify the Expo
  account and unique package identifier, and confirm the free build quota and
  SDK compatibility. Do not discard signing credentials or local app data.
