# DailyUp Android

Android Studio와 React Native Community CLI로 개발하는 Android 전용 앱입니다.

## 필수 도구

- Node.js `>=20.19.4 <21` 또는 `>=22`
- Microsoft OpenJDK 17 또는 동등한 JDK 17
- Android Studio
- Android SDK Platform 36, Build Tools 36.0.0, Platform Tools
- API 36 Android Virtual Device

현재 확인된 로컬 경로:

- Android Studio: `C:\Users\jemie\AppData\Local\Programs\AndroidStudioQuail\android-studio\bin\studio64.exe`
- Android SDK: `C:\Users\jemie\AppData\Local\Android\Sdk`
- JDK 17: `C:\Users\jemie\.jdks\ms-17.0.20`

다른 PC에서는 실제 설치 경로를 Android Studio의 SDK/JDK 설정에 지정하면 됩니다.

## 환경설정

`.env.example`을 `.env.local`로 복사하고 값을 채웁니다.

```dotenv
API_BASE_URL=http://10.0.2.2:3000
GOOGLE_WEB_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

`10.0.2.2`는 Android 에뮬레이터에서 호스트 PC의 localhost를 가리킵니다. 실제 기기는 PC의 사설 IP와 동일 네트워크를 사용해야 합니다. `.env.local`은 Git에 포함되지 않습니다.

## Android Studio 실행

1. `DSM_Front/android`를 Android Studio에서 엽니다.
2. Gradle JDK를 JDK 17로 지정합니다.
3. Device Manager에서 API 36 AVD를 실행합니다.
4. 별도 터미널의 `DSM_Front`에서 `npm ci` 후 `npm start`를 실행합니다.
5. Android Studio에서 `app` 구성의 Run 버튼을 누릅니다.

CLI만 사용할 때는 Metro 실행 후 다른 터미널에서 `npm run android`를 실행할 수 있습니다.

## 새 PC의 Google 로그인 등록

Android 기본 debug keystore는 PC마다 다르므로 새 PC에서 Google 로그인을 사용하려면 해당 PC의 debug 인증서를 같은 Google Cloud 프로젝트에 Android OAuth client로 등록해야 합니다.

1. `DSM_Front/android`에서 `.\gradlew.bat signingReport`를 실행합니다.
2. debug variant의 SHA-1을 Google Cloud Console 입력에만 사용합니다. 전체 값을 Git, 문서, 채팅에 기록하지 않습니다.
3. package name은 `com.dsm.dailyup`으로 등록합니다. 외부 OAuth client 생성은 프로젝트 관리자의 승인을 받은 뒤 수행합니다.
4. backend `GOOGLE_CLIENT_ID`와 `.env.local`의 `GOOGLE_WEB_CLIENT_ID`는 같은 Web OAuth audience를 사용합니다.

공용 개발 keystore를 Git에 넣거나 release 서명에 debug key를 재사용하지 않습니다. 현재 release signing은 의도적으로 별도 구성 전까지 비활성입니다.

## 검증

```powershell
npm test
npm run typecheck
npm run lint
cd android
$env:JAVA_HOME='C:\Users\jemie\.jdks\ms-17.0.20'
.\gradlew.bat assembleDebug
```

이 프로젝트는 로컬 개발에 EAS 빌드나 유료 서비스를 사용하지 않습니다.
