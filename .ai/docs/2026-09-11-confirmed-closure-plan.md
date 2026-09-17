# 남은55건 전체 수정 실행 계획

> 실행: superpowers:subagent-driven-development, 사용자 전체 수정·독립 분석 반복 승인(P-ALL55-20260911). 메인은 원장과 통합, 독립 분야만 위임한다. 기존 dirty checkout을 보존하며 같은 승인 범위에서 반복 확인하지 않는다.

목표: 아래55건의 원 조건을 해소하고 기능 회귀·분야별 및 전체 독립 분석을 반복한다. Architecture: 기존 NestJS/Prisma/PostgreSQL과 React Native0.83 Android Community CLI를 유지한다. 기존 사용자/세션 epoch·REST·UTC·idempotency 계약을 기반으로 누락 기능을 연결한다. 세부 인터페이스는 현재 소스/요구 대조 후 해당 batch 시작 전에 아래에 확정한다. Tech: Node22.23.2, Nest11, Prisma6, RN0.83.10/React19.2. Spec: canonical finding 원문·Planing Document/Requirements_Analysis_v1.3.md·.ai/docs/2026-07-19-frontend-page-requirements.md 중 현 Android 계약과 충돌하지 않는 요구.

## 전역 제약과 완료 기준

R20 최종판정: sharedclient candidate는 F092 UNKNOWN. 실제 SessionController+Providers/Store/Sync non-act 0/1/4microtask는POST0,20microtask는A권한POST만 발생했고 A engine은모두dispose됐다. 다른독립 reviewer의실제controller/provider검사도잘못된POST0. 초기API atomic token교체모형의P1확정표현은철회됐다. 아래조건부 scopedclient source계획은미실행/보류하며구현된기능으로보고하지않는다. 전체 A/B 나머지범위에서추가재현가능한코드결함없음. F015actualFCM/F047actualTalkBack 및F092실제기기전환조건은미검증으로남긴다.

R20 전체분석 A의 교차계정 요청 candidate: A outbox 전송이 microtask에 대기하는 동안 공유 client가 B로 바뀌면 응답 owner검사보다 먼저 B에 create될 수 있다. 독립검증 뒤 기존 AuthenticatedClient.request의 isCurrent 계약을 재사용한다. Front담당 exact `DSM_Front/src/features/auth/session-context.tsx` + `.test.tsx`: UI에 주입하는 client를 생성시 controller/epoch/owner에 묶고 매 요청 시작 전 동기 getEpoch/getSnapshot 검사 및 base request isCurrent와 결합한다. 원 runtime client는 내부 auth/notification 계약용으로 유지한다. 동일 owner·epoch의 authenticated/offline-workspace/정상 token refresh에는 client identity를 유지하고 새로운 session epoch에는 교체한다. 실제 React provider에서 이전 client로 만든 A engine→online queue→B emit 직후 HTTP0·B서버쓰기0·Aoutbox보존, 같은owner tokenrotation/replay 및 caller isCurrent 조합 회귀를검증한다. 다른 product/profile/calendar/statistics hook도 동일 scopedclient를사용하므로 공통 전송전경계를닫는다. 메인은 원장/기록과 독립 재검토를 담당한다.

R15-C2 기기 probe 메인 exact 기존 `.local/all55-notification-native-probe.cjs`: request-cancel phase로 실제설치module/SDKnormalizer/NotificationManager 경로의 동일id·동일deadline 서로다른ticket/oldcancel no-op/newcancel 제거를 확인한다. native wrapper의 shouldDisplay를 표시완료 직후 false로만들어 실제조건부취소도확인. 합성owner/id만사용하고마지막해당알림을정리한다. helper 실패판정에 passed/replacementPresent false도포함한다.

R15-C2 표시 요청별 취소: SDK 완료 뒤 JS current가 false가 되어도 새 동일ID표시를 지우지 않도록 schedule이 native 단조 ticket을 반환한다. 기존 exact Kotlin 모듈(Backend담당1파일)에서 bounded id→ticket map, display(payload,deadline,ticket), cancel(id,ticket) 도입. 실제 journal/Alarm의deadline은 유지하고 ticket은 process내 authority로만사용, cancelAll/expire/실패때정리. 메인 기존 notification-native.ts/.test.ts pair는 ticket보관·조건부취소를 모든실패에서 await하며 새ticket과 같지 않으면 native가 no-op. 같은deadline ABA도 ticket으로구분한다. 기존queue active1/100/latecallback순서를보존한다.

R19-A 계정 전환 반례 수정: 생성된 A engine이 dispose되기 전 공유 client가 B로 전환될 수 있으므로 checkpoint에 인증된 `userId`를 추가한다. 메인 기존 exact tasks.service.ts/.spec.ts + controller.spec.ts + task-sync.e2e-spec.ts를1~2파일씩 변경하며 Front 담당 기존 task-sync.ts/.test.ts exact pair에서 owner echo를 expected userId와 엄격 대조한다. GET readonly checkpoint의3필드(userId/serverTime/logicalTime) 계약이며 foreign 응답은 durable floor 변경 전 차단한다. 실제 A→B epoch 전환/동일client 회귀를 추가하고 두 reviewer 재검토한다.

R15-C native 표시 완료 경계: 기존 Notifee SDK의 native callback에서 만료·journal authority를 재검사하고 JS 실행과 독립적으로 exact tag/id를 취소한다. Backend 조사자에게 exact `DSM_Front/android/app/src/main/java/com/dsm/dailyup/ReminderExpiryModule.kt` + `DSM_Front/android/app/build.gradle`을 배정한다. 설치된 동일 core 202108261754를 app compile dependency로 명시하며 SDK upgrade는 없다. bounded 100개 queue/active 1개로 native display 완료를 직렬화해 이전 완료가 새 표시를 취소하지 않게 한다. 메인 exact `DSM_Front/src/features/notifications/notification-native.ts` + `.test.ts`: 설치 SDK validator로 같은 payload를 정규화하고 API24/25만 native display(payload, absoluteDeadline)를 호출한다. API26+ 기존 public SDK 경로 유지. cancelAll generation과 deadline 전후 검사를 보존, native compile/device TTL·replacement·collision 및 독립 재검토로 검증한다.

R19 HTTP exact 메인 `DSM_Back/test/task-sync.e2e-spec.ts`: 실제configureApp/TasksController/service를통해sync/clock staticrouting/no-store/인증주입ownerparameter를검증하며기존syncSQLfixture와회귀를보존한다. Authguard자체는기존실제guard검증의근거를재사용하고이fixture의guard모사는HTTProute/owner전달증거로한정한다.

R19 새P2 future logicalclock poison: 실제storage/engine/serverpolicy에서+1h작업→시각수정→400/폐기/refresh/restart후후속정상작업도미래timestamp로차단됨. 사용자반복수정승인으로복구경로를추가하며LWW/기존outbox는보존한다. 단순floor0초기화는이미수락된+4minversion을잃으므로금지한다. Legacy문서형식은유지하고서버전체ownercheckpoint를읽은경우에만전용writer가floor를재계산한다.

Exact 단계1 메인 `DSM_Back/src/tasks/tasks.service.ts` + `.spec.ts`: getSyncClock(userId)에서현재owner의모든Task(softdeleted포함) LEFTJOINTaskSyncState의MAX(COALESCE(sync.updatedAt,task.updatedAt))를parameterizedPrismaSQL로조회, `{serverTime:ISO,logicalTime:integerMs}` 반환. 기존페이지/배열API보존·schema변경없음. 단계2 메인 `tasks.controller.ts` + `.spec.ts`: 인증GET /tasks/sync/clock staticroute를:id보다앞에추가하고delegate/no-store헤더확인. 단계3 Front개발자 `DSM_Front/src/features/product/task-offline-storage.ts` + `.test.ts`: rebaseLogicalTime(serverFloor,isCurrent) 전용직렬writer에서검증된floor와현재남은outbox최댓값을새lastLogicalTime으로설정하고한번내구저장. genericupdate감소금지보존, 다른cache/payload/id/timestamp불변·실패시원본보존·staleguard. 단계4 같은개발자 `task-sync.ts` + `.test.ts`: productionAPI clock()추가/strictresponse; online clockpoison 또는discardBlocked복구에서remoteQueue로checkpoint획득후serverTime/logicalTime max로rebase, enqueue도동일remoteQueue에직렬화하여checkpoint와자체ACK경합차단. pending/ACK불확실operation은바꾸지않고serverfloor도낮추지않는다. offline/HTTP실패시oldfloor유지및복구가능error,정상경로추가조회최소화. DI이전fixture의optionalclock없으면위험reset하지않는다. 실제PGcheckpoint는메인 exact `DSM_Back/test/task-sync.pg-spec.ts`에서타계정제외/다른날짜futureaccepted/softdelete/legacyfallback을추가검증한다. read-onlyendpoint를새로추가하는이유는기존legacy문서의로컬시각과서버수락시각을안전하게구분할근거가없기때문이다. 실제env/운영접근없음.

R14 native UI 검증 메인 exact ignored `.local/all55-ui-native-probe.cjs`: API24 Hermes debugger의 현재 unauthenticated 상태에서만 합성 offline-workspace owner `all55-ui-validation`을 메모리에 게시한다. 실제 token/login/provider 호출 없이 OfflineTaskStorage의 StringStorage를 전용 메모리Map으로 주입하고 HTTP client는 network 오류로 막는다. 실제 AppTabs/Task sheet/Modal/44dp control을 Computer Use로 확인한다. 앱 reload로 원래 module/controller를 복구하며 실제 저장소·credential·DB를 읽거나변경하지않는다. 합성 fixture는 OAuth/실제사용자 flow 증거가아니다. Native accessibility hierarchy는 adb exec-out uiautomator XML을 메모리에서투영하여검증하고 별도기기파일을만들지않는다.

통계 날짜계약 보완 메인 exact `DSM_Front/src/features/product/analytics-api.ts` + `.test.ts`: Backend와같이 API range의year0000을요청전거부한다. 기존UTC Gregorian/42일한도/0099표현을보존하며invalidinput HTTP미호출회귀로확인한다.

## B23 — F074/F075 인증 WebSocket 신호와 REST 수렴

R12-B 시간경계 메인 exact DSM_Front/src/features/realtime/realtime-client.ts/.test.ts: default elapsed clock Date.now를 RN performance.now로변경하여벽시계후퇴가5초연결timeout/60초fallback/재시도deadline을연장하지않도록한다. JWTexp/serverUTC는서버검증으로유지, test명시주입clock계약은단조시간이다.

R12-B 새경합 수정 메인 exact realtime.gateway.ts/.spec.ts (DSM_Back/src/realtime): authenticate대기중전역revocationGeneration변경은대상계정을아직확정하지못하므로4003 확정폐기대신1013 재시도가능close를쓴다. 이미인증된해당owner/sid의실제폐기는4003유지. 타계정Alogout동안B인증대기→Front자동Blogout이일어나던반례를재시도가능code로막으며재접속은서버activefamily/JWT다시검증. 추가무한map/query없음,공유global변경시일시재연결가능성은명시한다.

실제격리통합 exact 신규 `DSM_Back/test/realtime.pg-spec.ts`: loopback55348/all55_validation PostgreSQL와새전용Redis `dsm-all55-ws-redis-20260911` labeldsm.all55=20260911/loopback56348, 기존공식Redisdigest를사용한다. 두Nest gateway+sharedactualRedisbus+actualSessionVerifier/Prisma/JWT 및Auth/Tasks/Scores서비스로cross-instance 사용자격리/invalidation/reset/revoke/expiry와transaction rollback신호없음을검증한다. 합성User/family/Task전용UUID만삽입정리, 실제env/provider접근없음, marker ALL55_DISPOSABLE_DB_TEST=1와URL명시gate. 테스트설계자는source단일파일만쓰고DB/Redis실행은메인. rootcontainer/rebuild통합은기존소유label검증후진행한다.

메인 검증 exact `DSM_Back/src/app.module.spec.ts`: realmodulegraph에RealtimeModule등록/실제globalbus주입확인, 기존scheduler/FCMdisabled계약보존. nativeincrementalbuild는기존SDK/manifest검증단계재사용한다.

Front 단계3신규 exact `DSM_Front/src/features/realtime/realtime-context.tsx` + `.test.tsx`: ProductContext안에서store/applyRealtime와native공유session controller+baseURL의RealtimeClient를연결하는RealtimeProvider/useRealtime. AppStateactive만start,foreground전환/cleanup연결, onInvalidate scores/rankings→store.applyRealtime/reminders→현재notificationcontroller.sync(true), notifycontext레퍼런스latefence. 생성factory DI는테스트용으로주입가능, production기본lazy native sharedruntime. snapshot상태를rankingUI에제공하고기본provider부재는null. 다음메인단계4 product-context.tsx/.test.tsx providerwrap, 단계5 ranking.tsx/product.test.tsx 상태안내와projection최대약1분지연표시.

Reminder signal은신규 DSM_Back/src/realtime/reminder-signal.service.ts/.spec.ts에30초Cron(waitForCompletion) global neutral reminders scope만보내FCM미설정에서도접속중due시각변화를REST조회로반영한다. 원문내용/사용자목록/DBquery추가없음; 여러인스턴스동시tick은gateway1초scope병합,영구이벤트기록없음. Frontforeground60초RESTfallback/기존알림30초poll은유실복구를보존하며최종통합에서중복poll의실제신호coalescing확인.

Front 단계2 exact `DSM_Front/src/features/product/product-store.ts` + `.test.ts`: realtime invalidation의scores/rankings REST재조회공개메서드, inactive/offline no-op, 범위바뀜/기존generationfence보존. 요청동시1+유한pendingSet으로중복신호 coalesce하며 dispose뒤late결과게시금지, 실패시기존캐시+안전오류·후속신호복구. Task일반reload/mutation 기존동작보존. 다음 UI효과pair는메인이후속추가한다.

메인통합 exact 단계1 신규 `DSM_Back/src/realtime/realtime-bus.module.ts` + `.spec.ts`: ConfigModule만의존하는globalbus모듈로Auth/Gateway순환의존방지. 단계2신규 `src/realtime/realtime.module.ts` + `.spec.ts`: AuthModule/Gateway/bus연결. 단계3신규 `src/realtime/realtime-ws.adapter.ts` + `.spec.ts`: WsAdapter 기본rawerrorlogger를고정문구로대체하고gateway만frame처리(기본추가JSON parser비활성),실제WS의maxPayload/경로/close검증. 단계4기존 `src/app.module.ts` + `src/main.ts`: 위모듈/adapter등록. 앱module기존spec는후속정확pair. 발행점 단계5 `src/tasks/tasks.service.ts` + `.spec.ts` commit뒤user scores/reminders, 단계6 `src/rankings/ranking-cache.service.ts` + `.spec.ts` Redisgeneration활성성공뒤all rankings, 단계7 `src/auth/auth.service.ts` + `.spec.ts` logoutfamilyrevocation/accountdelete commit뒤revoke발행. 이모든경로는 DSM_Back아래이며 optionalbus로기존단위fixture계약보존, 실제AppModule DI에서bus존재검증. 전송실패는이미commit된mutationHTTP성공을바꾸지않고catch하며원시정보로그없음.

Front 단계1 exact 신규 `DSM_Front/src/features/realtime/realtime-client.ts` + `realtime-client.test.ts`: 주입 session/WebSocket factory/baseURL, start/stop/setForeground와 snapshot/subscribe/신호callback을 가진 단일연결 client. 기본 native WebSocket, HTTP(S) base를 WS(S) /realtime로 변환하며 credential/query/hash 금지. authenticated+idle 또는 refreshing 중 현재epoch만연결, foreground false/계정epoch변경/종료즉시닫고 timer정리. open시 현재access token을첫authenticate frame으로만전송; 없거나4001/4010닫힘은동시1refresh후1~30초backoff. reset/version/UUIDv4/seq0 및 invalidate exactschema·4KiB·scope3검증, sequencegap/reset/reconnect는전체REST수렴callback, 중복/역순무시. 60초foreground fallback, callback동시1개+pending scopeSet coalescing, network/auth callbacklatefence, close/error/silentconnect5초·초기reset5초timeout으로유한복구. 실제API/UI연결은후속exact pair로분리한다.

기존 Node/Nest/RN 및 Redis를 유지한다. NestWsAdapter+RN기본WebSocket으로 추가클라이언트SDK없이 구현한다. 인증후 neutral invalidation(scopes scores/rankings/reminders)→기존REST 재조회, 실제점수/내용은서버조회만. 점수는Task commit이후, ranking은기존분단위projection generation 활성화직후 전송한다(배치최대약1분지연을명시). 토큰은URL대신 연결후5초내 단한번 authenticate frame, HTTP와같은JWT/activefamily검증. streamId/seq reset/gap/재연결시REST수렴, 영구eventlog없음. Redis Pub/Sub두연결과localdispatch, 중복ID bounded, 재접속reset과60초foreground REST보완으로유실대응. 사용자/title/credential을외부broadcast하지않는다.

메인 exact package단계 `DSM_Back/package.json` + `package-lock.json`: Nest와동일11.2.3 @nestjs/websockets/@nestjs/platform-ws 고정, ws 타입필요시동일pair. Backend담당 단계1신규 `DSM_Back/src/auth/session-verifier.service.ts` + `.spec.ts` 기존guard계약추출, 단계2기존 `DSM_Back/src/auth/guards/jwt-auth.guard.ts` + `.spec.ts`, 단계3 `DSM_Back/src/auth/auth.module.ts` + `.spec.ts` 연결(기존spec존재여부확인후신규). 다음각pair 신규 `src/realtime/realtime.policy.ts/.spec.ts`, `realtime-bus.service.ts/.spec.ts`, `realtime.gateway.ts/.spec.ts`, `reminder-signal.service.ts/.spec.ts`. 각단계완료보고후다음pair진행한다. 모듈/발행점은구현전exact추가한다.

연결상한instance1000/authpending50/user4/sid2, frame4KiB/compressionOFF, auth5초/expiry정확종료/30초familycheck, buffer64KiB초과종료, socket당pending scope집합1/초당1회flush. Redis중단은local신호와REST fallback, 큐무한증가금지. 폐기event+검증으로종료, nativeforeground/authenticated에서연결1/timer1/1~30초backoff; offline/logout/epoch변경즉시정리. 서버resource/정적/실제Redis+WS/Front수명회귀와독립2검토를완료조건으로한다.

## B21 — F045/F056/F076 오프라인 작업·복구 통합

R8-E 후속 메인 session-controller.ts/.test.ts: unauthorizedCleanupPromise의epoch무관coalescing으로A폐기응답대기중새B의401cleanup이A작업에합쳐지는경계. 같은cleanupEpoch만coalesce하고oldfinally는operation identity를유지해Bcleanup을지우지않도록실제A/Brevoke지연회귀를검증한다.

R8-D 새cleanup경합 메인: logout/deleteAccount 서버성공뒤bootstrapping subscriber가새signIn을시작하면oldinvalidateGrant뒤readAndClear가새credential을지울수있다. 단계1 exact `DSM_Front/src/features/auth/token-store-coordinator.ts` + `.test.ts`에 optional expectedEpoch를받는readAndClear의writer입장/비동기read뒤fence추가(기존무인자계약보존). 단계2 `local-session-store.ts` + `.test.ts` invalidateGrant에optionalcurrentcallback을writer내부까지적용. 단계3 session-controller.ts/.test.ts 모든epoch별cleanup에명시fence전달, logout/delete/unauthorized/leaveOffline별subscriber재진입과새grant/credential보존검증. 새로운credential은단일writer순서로보호하며데이터내용추측으로삭제안함.

R9-BF 복구 경계 수정: sync engine pair에서 확인된 cache42일 ACK 교착은 pending operation을 절대 삭제하지 않고 현재 ACK/조회 날짜를 보호하며 가장 오래된 다른 서버 cache 날짜를 정리해 해결한다. 캐시는 재조회 가능하고 outbox는 원본 그대로 유지한다. blocked create 뒤 편집이 영구 대기하는 문제는 확정 거절된 작업 묶음에 대한 명시적 '이 기기의 변경 취소' 복구를 제공한다. 네트워크 응답 불명 상태의 요청을 자동 변형/삭제하지 않으며, 사용자 확인 뒤 해당 task의 blocked+후속 pending만 버리고 서버 cache/재조회로 돌아간다. exact sync pair → product-store pair → Home/test pair를 단계별 사용한다. 원격 서버 작업 삭제나 손실 ACK 작업 자동삭제와 구분한다.

R8-B P1 추가 회귀: local exit의 logging-out 중 시작된 bootstrap/retry/refresh가 같은 증가 epoch로 토큰을 재발급해 종료 성공 후 재인증할 수 있다. 메인 exact `DSM_Front/src/features/auth/session-controller.ts` + `.test.ts`: 종료 중 새 recovery/refresh 시작을 차단하고 종료 이후 오래된 operation의 commit fence를 보존한다. 실제 localStore/coordinator를 이용해 exit진행중·publish subscriber 재진입·이전 refresh지연과 명시 새계정 signIn을 대조한다. 계정삭제 API의 정당한 refresh는 보존한다. 종료 성공 상태를 listener에 내보내기 전에 필요한 fence를 확정한다.

## B22 — F015 알림 client·설정 연결

R15 독립경계보완: relativeTTL은nativebridgequeue지연만큼늘어나므로native `elapsedRealtime():number` 동기조회후같은clock의absolute deadline을 `schedule(id,deadlineElapsedMs)`에전달한다. Native는현재elapsed와차이1..300000만허용하고journal/Alarm/Handler에같은absolute값을사용한다. JS는display전에한번만예약하고native처리뒤performance수명재검사,display후만료/owner변화는정확tag취소한다. 두번째relative재예약은제거하여deadline연장을막는다. Exact기존nativepair+ReminderExpiryModule.kt, 공개사용자설정/서버API변화없음.

R14 fallback실제검증보완: API24 AlarmManager의min_futurity5초/idlequota로1초TTL은2.2초probe에남고약5초뒤receiver실행됨을확인했다. 같은ReminderExpiryModule.kt 안에최대100개/id한개 Handler(mainLooper) 만료callback을추가하여process생존중단기만료는처리하고persistentalarm은process종료backup으로유지한다. 교체/실패/cancel/expire때callback제거, 동일lock/deadline확인재사용. JS는표시전deadline예약→표시→남은시간재예약으로이전알람이새표시를취소하는window를막는다. OSidle/강제종료의시각보장은추가하지않는다.

R14 실제 API24 만료 RED(remaining1000→2200ms 뒤알림잔류), 독립AndroidX/Notifee코드검증으로 API26미만timeoutAfter no-op 확정. 기존지원min24를보존하는native fallback을추가한다. exact 단계1 신규 `DSM_Front/android/app/src/main/java/com/dsm/dailyup/ReminderExpiryModule.kt` + `ReminderExpiryReceiver.kt`: API24/25 AlarmManager ELAPSED_REALTIME_WAKEUP/setExactAndAllowWhileIdle의exportedfalse receiver, fullnotificationID tag+Java hash로해당알림만취소, 최대100개전용SharedPreferences deadline journal/동기직렬화로reschedule-oldalarm경합차단·process종료뒤에도취소. Doze/OS 강제종료의delivery지연은운영체제제약으로명시, hardrealtime보장은아니다. TTL1..300000ms/id≤8192, invalid/failure는고정오류, content/token로그없음. API26이상은기존OStimeout사용. 단계2 메인 `notification-native.ts` + `.test.ts`에서fullstableID를android.tag에도설정하여NotifeeJavaHash collision격리, nativefallback schedule실패시동일tag/id알림취소, cancelAll은전용alarmjournal정리. elapsed는performance.now 사용. 단계3 메인 `MainApplication.kt` + `AndroidManifest.xml` package/receiver등록. 실제API24 TTL·재예약·processkill후expiry/계정동일hash격리와unit/type/build/독립2review검증. 기존기기credential/사용자정보를probe로열람하지않는다.

API24 실제알림아이콘이launcher배경까지알파마스크되어사각형으로보이는문제: 메인exact 신규 DSM_Front/android/app/src/main/res/drawable/dailyup_notification_icon.xml에단색체크/상승선만두고, 다음pair notification-native.ts/.test.ts에서이 smallIcon참조를연결한다. 나머지launcher원본/채널/표시계약보존, SDKpayload단위+Androidrebuild/localnotification 실제관찰로확인한다.

메인 actualAPI24 로컬표시probe exactignored `.local/all55-notification-native-probe.cjs`: MetroHermes inspector에서현재배포notificationNative와Notifee를직접호출하여permission/configured상태, syntheticowner all55-notification-validation의무음/무진동local표시·timeout/dedupeid/data 확인. externalFCM/token발급/실제사용자데이터없음. cleanup은정확syntheticnotification id1개만cancel하고readback, realexistingnotifications취소없음. screenshot은computer-use실제에뮬레이터관찰, 테스트native본문외서버push성공주장없음.

R10-B 시계경계 수정: 메인 단계1 notification-storage.ts/.test.ts의markDisplayed에 optional remainingMs(0..300000) 입력을추가해 서버유효기간을저장시점기기clock의local expiry로변환하고24h중복보존기간은displayedAt기준그대로유지한다. 단계2 notification-controller.ts/.test.ts에서서버time+monotonic으로검증한remaining을전달, 기기±1시간에서도두sync와재시작후중복표시없는회귀. 원본서버reminderexpiresAt과실제표시deadline은수정하지않는다. 모두 DSM_Front/src/features/notifications 아래exact source/test pair.

R10-B 새401 microtask경합: 메인 exact `DSM_Front/src/lib/api/authenticated-client.ts` + `.test.ts`에서 request별 optional current predicate와 session optional getEpoch를 캡처하고 최초요청/refresh microtask/재전송/unauthorized cleanup 직전 및 응답뒤 재검사한다. 이전계정 요청이 새계정 토큰갱신·재전송·종료를하지않도록401reject직후계정전환 회귀 추가. 다음pair `src/features/notifications/notification-runtime.ts` + `.test.ts`에서 scoped predicate를공유client.request까지전달, 다음pair `src/features/auth/session-runtime.ts` + `.test.ts`에서 sharedclient getEpoch연결. 기존동시refresh coalescing/late완료cache 정상동작보존. Root수정후구현자분리2review.

UI통합메인 다음 exact 단계: 신규 `DSM_Front/src/features/notifications/notification-context.tsx` + `.test.tsx`는runtime singleton observer와최대1 foregroundbanner/tappending을계정epoch로격리하고nativeforeground lifecycle을연결한다. 단계2 신규 `DSM_Front/src/components/dailyup/notification-task-bridge.tsx` + `.test.tsx`는payloadexact type/user/task/schedule/startAt검증→현재인증GET/tasks/id 검증→현재date전체reload→TaskSheet열기, dirtyform/mutation시자동폐기없이알림열기보류, invalid/타계정/deletedtask오류안내. 단계3 기존 `DSM_Front/src/App.tsx` provider연결, 단계4 `src/app/(tabs)/_layout.tsx` + `src/__tests__/app/tabs/layout.test.tsx` bridge연결, 단계5 `src/app/(tabs)/mypage.tsx` + `src/__tests__/app/tabs/mypage.test.tsx` 설정Panel실제진입. 단계6 session-context.tsx/.test.tsx 기본runtime logout/deleteAccount callback에prepareLogout→기존authaction→실패resume 연결(injectedtestcontroller동작보존). 단계7 `DSM_Front/index.js` handler설치. 각단계이외파일수정없음.

Native glue Front담당 exact 신규 `DSM_Front/src/features/notifications/notification-runtime-native.ts` + `.test.ts`: shared getSessionRuntime/NotificationRuntime singleton, nativeKeychainbinding과계정별AsyncStorage NotificationStorage(max10writers), RNFirebase background/foreground/tokenRefresh등록및Notifee press/initialnotification연결. 설치함수1회, foreground AppState/주기timer만cleanup가능하게관리, background handler는세션복구가bootstrapping일때만bootstrap 후authenticated검증/receive하고독립토큰writer를만들지않는다. foreground reminder/tap callback구독진입점만제공(외부URL자동열기없음), latestpendingtap1개/새계정검증은tapconsumer단계. 앱entry/index.js와UIprovider연결은메인별도단계다.

R10-A2 후속: defaults빈배열은Notifee9.1.8실제validator가거부하므로최종 defaults:[AndroidDefaults.LIGHTS]로기본소리/진동플래그만제외하고개별sound/vibration으로제어한다. nativepair에설치된실제validator4조합회귀를추가했다. Binding escapedJSON이read16384한도를초과해저장소를고착시키는경계는write전encoded.length검사로차단하며test pair에control문자4096/정상후속쓰기회귀를둔다.

설정UI 메인 단계 exact 신규 `DSM_Front/src/components/dailyup/notification-panel.tsx` + `.test.tsx`: injected NotificationController snapshot으로전체서버알림,local소리/진동/foreground,OS권한/구성미완료상태,설명후권한요청/OS설정/재시도제공. 44이상touch/accessibilitylabels/pendingdisabled/error안내, 미구성은전송가능으로표시안함. 이후MyPage기존pair에실제진입연결, wrapper/modal접근성은기존sheet패턴재사용한다.

Runtime 단계 Front담당 exact 신규 `DSM_Front/src/features/notifications/notification-runtime.ts` + `.test.ts`: injected SessionControllerPort/client/native/binding/storageFactory로 foreground/headless가하나의계정scope를공유한다. authstate/epoch변경시동기적으로oldscope표시차단, 이전비동기작업settle/native취소·token삭제/comparebinding정리뒤새owner초기화 직렬화. authenticated상태만server내용조회, offline에서는푸시내용없음. foregroundcallback과controller subscription으로UI진입점제공, onMessage/tokenRefresh와backgroundhandler는native glue별도단계. logout 준비는controller의FCMrevoke/정리완료를기다린뒤기존session.logout를호출하도록UIwrapper연결하며 실패는성공으로표시하지않는다. 강제인증종료/offline exit는native token/notification정리후binding을안전하게처리한다. 오래된scope가공유authclient로새계정권한요청/401재시도를수행하지않도록 scoped client getAccessToken/refresh/unauthorized의owner·epoch fence를추가한다. 구체적port는기존runtime/authenticatedclient실제소스대조후담당자가보고한다.

R10-A 회귀수정 메인: native pair에서 실제Notifee 기본defaults ALL로API24/25무음이깨지는문제를 명시defaults빈배열/개별sound·vibration설정으로수정한다. Backend 단계1 exact기존 `DSM_Back/test/notification-client.pg-spec.ts`에 legacy제목200공백prefix/JSON ms정밀도만료경계123µs 재현, 단계2 `notifications.service.ts` + `.spec.ts`에서 SQLtitletrim200/fallback 및 JSON밀리초정밀도상이미만료인행제외. 원scheduledAt/id커서tupleµs정밀도는보존한다. 기존실제7PG검사에회귀를추가하고독립R10-A2재검증한다.

Token binding 단계 메인 exact 신규 `DSM_Front/src/features/notifications/notification-binding.ts` + `.test.ts`: 별도 device-onlyKeychain service dsm.notifications.binding.v1에 owner/token 한개를직렬저장·readback검증한다. native token획득후서버등록전에내구화하여 ACK유실/재시작뒤권한거부에도폐기가능. 같은owner는토큰재사용, 다른owner는이전native토큰삭제확정후새토큰획득. clear는expectedowner/token compare를사용하고원문오류/토큰출력없음. runtime의전역직렬accounttransition과함께사용한다.

Auth runtime 공유 단계 메인 exact 신규 `DSM_Front/src/features/auth/session-runtime.ts` + `.test.ts`: 기존 SessionProvider 내부 factory를 lazy singleton으로 추출하여 headless/foreground가 동일 coordinator/controller를 쓴다. 이후 `session-context.tsx` + `.test.tsx`에서 동일 getSessionRuntime 사용, injected test controller 보존. native/token읽기는 최초 runtime요청/기존bootstrap때만 발생한다. Notification lifecycle callback은 다음단계에서 session-controller pair에 추가하여 logout serverrevoke전 FCMrevoke를 기다리며 필요한 refresh를허용하고 실패시 안전한오류로 원credential보존한다.

Native adapter 단계 메인 exact 신규 `DSM_Front/src/features/notifications/notification-native.ts` + `.test.ts`: RNFirebase modular app/messaging, Notifee permission/channel/display/cancel/settings ports. 미설정 안전상태, 권한요청은 UI설명 뒤명시동작, stable owner/schedule ID, private lockscreen visibility, timeoutAfter 남은expiry, sound/vibration별고정channel, payload 외부URL 미수용. background handler 등록은 entry 별도단계. 자동 token생성은 manifest metadata로 꺼두고 인증/권한확인후 explicit getToken한다. 서버내용과 session epoch 검증은 controller책임.

Native 의존성 단계 exact `DSM_Front/package.json` + `package-lock.json`: 공식 RNFirebase26.4.0(app/messaging 동일버전), Notifee9.1.8을 save-exact/ignore-scripts로 설치한다. Expo peer는 optional이며 Community CLI를 유지한다. 다음 단계 exact `DSM_Front/android/build.gradle` + `android/app/build.gradle`: 공식 Google Services plugin 고정버전 및 실제 google-services.json 존재 시에만 적용, 미설정 build/앱 시작은 유지하고 푸시 설정 상태를 명시한다. 실제 설정 파일 내용은 열람하지 않는다. 이어 `DSM_Front/android/app/src/main/AndroidManifest.xml`에 POST_NOTIFICATIONS 권한만 연결한다.

Front storage 단계 확정: 계정별 notification preference(sound/vibration/foreground)와 최대200개/24시간 표시 기록을 injected 문자열 저장소 단일 envelope/직렬writer로 저장한다. 저장 실패시 표시를 완료했다고 기록하지 않으며 native stable notification ID 갱신으로 재시도의 중복을 제한한다(원자적 exactly-once 주장 없음). 시간·owner·schema·payload 크기 검증, 다른계정 기록 불가. exact 신규 notification-storage.ts/.test.ts pair만 해당 담당자 소유.

사용자 전체 누락 기능 구현 승인/P-ALL55를 재사용한다. 기존 neutral FCM `{type:'REMINDER_SYNC',version:'1'}`는 유지한다. 공개 키/실제 Firebase 설정값을 만들거나 읽지 않는다. 서버에서 인증된 현재 일과를 조회한 후에만 단말이 내용을 표시하며 offline grant/cache만으로 알림 내용을 만들지 않는다.

- 단계1 Backend 담당 exact `DSM_Back/src/notifications/notifications.service.ts` + `notifications.service.spec.ts`: getSettings/setSettings(userId,boolean), reminders(userId,query) 추가. 설정은 User.notificationEnabled만 응답, 없는 User404. reminder는 단일 parameterized SQL로 서버 기준 최근5분·현재startAt과schedule일치·Task PENDING/미삭제/개별ON·User전체ON·schedule CANCELLED제외를 같은 조회에서 보장한다. 최대100, 안정된 scheduledAt/id cursor와 owner/window validation, serverTime/expiresAt 및 필요한 id/taskId/title/startAt만 반환. SENT는 단말 ACK가 아니므로 제외하지 않는다. 기존 token registration/revocation/transaction 계약 보존.
- 단계2 Backend exact 신규 `DSM_Back/src/notifications/dto/notification-client.dto.ts` + `.spec.ts`: strict boolean/unknown field policy, cursor/limit1..100. 단계3 기존 `notifications.controller.ts` + `.spec.ts`에 GET/PATCH settings 및 GET reminders 연결, 단계4 신규 `DSM_Back/test/notification-client.e2e-spec.ts` 및 `notification-client.pg-spec.ts`는 각 별도 단계에서 HTTP/실제DB 검증.
- Front 단계1 신규 `DSM_Front/src/features/notifications/notification-api.ts` + `.test.ts`, 단계2 `notification-storage.ts` + `.test.ts`, 단계3 `notification-controller.ts` + `.test.ts`. 계정·epoch 소유권/중복·재시도·설정OFF·expiry를 검증한다. server-auth fetch 뒤 표시, singleflight, 안정ID 중복갱신, 영속 dedupe24h/200개 제안은 구현 전 단말 저장 실패 의미와 함께 확정한다.
- 인증 runtime/headless/native/설정화면/패키지 exact 단계는 앞 계약 통과 후 기록한다. FCM 등록→기기폐기→서버logout 순서를 직렬화하며 실패시 로그인/재시도 UI를 보존한다. 실제 Firebase project 설정·수신/Doze·강제종료는 별도 gate다.

## B21 세부 구현 및 검증

기기검증 준비: 기존 `DSM_OLD_API24` AVD를 데이터 초기화 없이 포트5584에서 실행하고 GUI는 computer-use로 확인한다. exact ignored 실행로그 `.local/logs/all55-api24-out.log` + `.local/logs/all55-api24-err.log`. 현재 산출된 debug APK 설치·시작은 기존 승인된 Android 검증 범위이며 실제 사용자 credential 직접열람/AVD wipe/기존데이터삭제는 하지 않는다. 순수 빌드 성공과 실제 화면/저장 복원 통과를 분리해 기록한다.

native 저장 검증 helper exact `.local/all55-native-probe.cjs`: task Metro127.0.0.1:8081의 현재 DailyUp Hermes inspector에 연결해 native storage/entropy 모듈만 실행한다. 인증 우회나 실제 credential read 없이 전용 합성 user `all55-native-validation`의 offline cache와 별도 Keychainservice `dsm.all55.validation`만 쓰고 process-kill 후 다시 읽어 검증한다. 기존 사용자 service/cache는 읽거나 지우지 않는다. 모듈 metadata 조회/검증 summary만 출력하며 전체 runtime/global object나 token을 출력하지 않는다.

R8-A 검토 회귀 수정: frontend 담당 단계1 exact `DSM_Front/src/features/auth/session-controller.ts` + `session-controller.test.ts`. grant read/write 실패가 token rotation 후 bootstrap을 refreshing에 남기는 경로를 안전한 storage-error/복구 경로로 수렴시키며 실제 LocalSessionStore 실패 회귀를 추가한다. 보관 폐기 요청은 공개 `drainPendingRevocations()`의 coalesced 재시도로 노출하고 signIn 성공/로컬 종료 직후에도 시도한다. 다음 단계2 exact `DSM_Front/src/features/auth/session-context.tsx` + `session-context.test.tsx`에서 상태와 무관하게 foreground/유한 주기 재시도를 연결하되 동시 요청을 누적하지 않는다. 실제 서버 폐기 ACK 전 pending을 지우지 않고 새 계정 grant를 보존한다. 구현자와 독립인 reviewer가 재검증한다.

ProductStore 연결은 단계6/7 경계를 재사용한다. effect setup마다 새 OfflineTaskSync를 만들며 계정별 OfflineTaskStorage writer만 재사용한다. terminal dispose 이후 ACK/오류는 cache/outbox를 쓰지 않고 동일 operation 재전송에 맡긴다. offline 상태에서 원격 score/ranking/category 요청을 하지 않으며 일과는 durable queue commit 후 게시한다. Home의 동기화 대기/오류/재시도 표시 exact `DSM_Front/src/app/(tabs)/index.tsx` + `DSM_Front/src/__tests__/app/tabs/product.test.tsx`.

시간경계추가수정 exact Backend담당 `DSM_Back/src/scores/scores.service.ts` + `.spec.ts`: Tasks0099일일상한과동일한 Date.UTC(0~99→1900년) startOfUtcDay결함을Date복사/setUTCHours로정정한다. getDailyScore/recompute 양쪽0099경계와원Date비변경검증,범위통계날짜/현재UTC정책보존. 별도schema변경없음. Front analytics year0000와server범위정책차이는후속대조대상이다.

Offline UI exact 메인 신규 `DSM_Front/src/components/dailyup/offline-status.tsx` + `.test.tsx`: local-workspace만연결복구/다른계정종료안내를표시한다. Home기존 `DSM_Front/src/app/(tabs)/index.tsx` + `DSM_Front/src/__tests__/app/tabs/product.test.tsx`는banner연결/offlinecalendar원격조회대신기존날짜controls와cache유지. `DSM_Front/src/app/(tabs)/_layout.tsx` + 신규 `DSM_Front/src/__tests__/app/tabs/layout.test.tsx`는offline중Ranking/MyPage 원격기능을recovery화면으로대체하고Home/동일ProductStore는유지한다. SessionProvider기존pair에offline일때만foreground/5초간격복구재시도(동시bootstrapcoalescing)추가. local상태를serverauthenticated로명명하지않는다.

HTTP 검증 단순화: 단계4의중복 DTO 대신순수parseSyncOperation이 unknown body전체/unknownfields/형식/상한을한곳에서검증한다. Controller @Body unknown을sync에전달하며기존전역ValidationPipe coercion을새sync에적용하지않는다. Backend 담당기존 tasks.controller.ts/.spec.ts pair에POSTsync와GETsync(:id앞) 연결,메인신규 `DSM_Back/test/task-sync.e2e-spec.ts`에서실제HTTP invalid입력차단/정상흐름을확인한다.

Sync projection보완: 기존Task응답형은유지하고새sync응답task에 syncUpdatedAt/syncMutationId를포함한다. native offline동기화조회 `GET /tasks/sync`는기존동일query/date/limit/cursor100을사용해full-day snapshot을만들고필요한논리시각을함께반환한다. 이는증분feed가아니며legacy GET/tasks를변경하지않는다. service.findAllForSync는현재ownedTask목록이확정된뒤해당ID의state최대100만조회/병합하며추가서버시간필드는POST응답에둔다. Front observed logicaltime은반환metadata까지반영한다. 단일consistentDBsnapshot주장을하지않고pendingoverlay·후속refresh로수렴검증한다.

Native adapter 경로 정정: RN resolver가 base와같은이름.native.ts를우선해coreimport가자기자신으로순환하는실패12건을확인했다. auth native pair를 `DSM_Front/src/features/auth/local-session-keychain.ts` + `.test.ts`로옮기고기존core이름을유지한다. product adapter도신규 exact `DSM_Front/src/features/product/task-offline-native.ts` + `.test.ts`를사용해아래초기 .native 경계를대체한다. 테스트/import도해당pair안에서수정,원core동작불변.

Auth단계A 메인 exact신규 `DSM_Front/src/features/auth/local-session-store.ts` + `.test.ts`: 주입한보안문자열저장소의단일envelope(version/grant/pendingRevocations),직렬쓰기·실패시현재값보존·grant refreshcredential일치/최대30일·epoch callbackfence. pending폐기credential최대10개/전체128KiB,원문오류/token로그없음. deferRevocation은grant무효화와pending추가를같은write로확정하고성공뒤만활성토큰정리진행. drain은네트워크동안writer를잡지않고동시1개,서버ACK뒤해당pending만제거한다. 단계B신규 `DSM_Front/src/features/auth/local-session-store.native.ts` + `.test.ts`는별도device-onlyKeychainservice와readback검증,자동tombstone판단없음. 단계C 기존session-controller.ts/.test.ts, 단계Dsession-context.tsx/.test.tsx, 단계Esession-routing.tsx/.test.tsx, 단계F `DSM_Front/src/app/session-recovery.tsx` + `DSM_Front/src/__tests__/app/session-recovery.test.tsx`; 단계G기존product-context.tsx/.test.tsx/Home/MyPage별pair는offline권한경계를연결한다. 정확route화면변경은해당단계시재확인한다.

기존 REST/서버발급create ID/서버완료시각·UTC점수·삭제후복원금지 계약을 보존한다. 새 `POST /tasks/sync`는 요청당1operation `{mutationId,taskId,updatedAt,kind:create|replace|delete,task?}`을받고 userId/completedAt/score를받지않는다. create는native CSPRNG UUIDv4의mutationId=taskId,불변최초payload를저장·재전송한다. replace는편집필드전체snapshot. 응답 `{mutationId,outcome:applied|superseded|deleted,task,serverTime}`. 기존Task JSON/scalar형을유지하기위해 TaskSyncState(taskId PK/FK cascade,updatedAt 논리시각,mutationId,mutationHash,createHashnullable) 한행을사용한다. 가변operation이력무한저장은없다. 상태row없는legacy행은Task.updatedAt으로비교하고legacy수정은존재하는state논리버전도갱신한다.

활성수정은논리(updatedAt,mutationId) LWW, 같은키/다른payload409. create fingerprint는수정·삭제뒤ACK유실재전송에도최초요청을식별한다. 삭제는기존복원금지를위한terminal/delete-wins 예외이며더늦은replace도부활시키지않는다. UUID충돌타소유자404. 완료시각은실제서버승인시각으로기존점수정책유지,과거offline완료시각을신뢰하지않는다. 동일Serializable client안에서기존Task변경·알림·점수helpers공유,최대3retry; stale/replay는sideeffect재실행없음. updatedAt은명시UTCms문자열·유효날짜·서버보다5분이상미래거부,클라이언트clock오류는queue보존후명시복구대상이다. 새sync만title200/description4000/요청16KiB를제한한다.

Backend단계1 메인 exact `DSM_Back/prisma/schema.prisma` + 신규 `DSM_Back/prisma/migrations/20260911110000_task_offline_sync/migration.sql` (기존데이터내용변경없음,空state table+FK). generate는생성물node_modules만. 단계2担当 신규 `DSM_Back/src/tasks/task-sync.policy.ts` + `.spec.ts`; 단계3 `DSM_Back/src/tasks/tasks.service.ts` + `.spec.ts`; 단계4 신규 `DSM_Back/src/tasks/dto/sync-task.dto.ts` + `.spec.ts`; 단계5 `DSM_Back/src/tasks/tasks.controller.ts` + `.spec.ts`; 실제PG testexact `DSM_Back/test/task-sync.pg-spec.ts`는메인실행/소유fixture만정리.

Front는계정별schemaVersion/userId/revision/cachedDates/categories/lastLogicalTime/outbox envelope를하나의직렬writer로저장한다. 저장성공후만local UI게시,ACK와outbox제거도한envelope저장,실패원본보존. outbox200/UTF8 envelope1MiB/최근42일·최대1000cachedTask한도,미전송자동축출없음. 완료된날짜별전체페이지조회만snapshot교체후pending투영. network/timeout/5xx는동일불변operation1~60초재시도,foreground/reconnectdrain동시1개. 영구오류는보존/차단표시하고같은task후속은대기,다른task진행. 계정·epoch이전응답은새계정에게시하지않는다.

Front단계1 메인 exact `DSM_Front/package.json` + `package-lock.json`: 공식문서/현재registry확인한 AsyncStorage3.1.1/createAsyncStorage·react-native-get-random-values2.0.0(RN>=0.81)·uuid14.0.2를정확버전설치. Android실제SQLite single-envelope process-kill은필수후속gate. Nativeentropy entry exact `DSM_Front/index.js`; 추가Maven필요시공식readme확인후기존Android build.gradle경계사용. 단계2 신규 `DSM_Front/src/features/product/task-offline-storage.ts` + `.test.ts`; 단계3 신규 `DSM_Front/src/features/product/task-offline-storage.native.ts` + `.test.ts`; 단계4 신규 `DSM_Front/src/features/product/task-sync.ts` + `.test.ts`; 단계5기존 product-api.ts/.test.ts; 단계6 product-store.ts/.test.ts; 단계7 product-context.tsx/.test.tsx. 모두해당 features/product 아래exact pair다.

인증복구는offline-workspace를authenticated와분리한다. 서버me검증완료사용자만Keychain에localgrant저장,grant는API권한이아니다. bootstrap네트워크실패시grant+refreshcredential일치확인후local작업화면을연다. 계정전환전에grant무효화,401/로그아웃/계정삭제는grant폐기,동일user확인전outbox전송금지. Offline local exit는폐기할refreshcredential을별도보안pendingrevocation기록에먼저보존한뒤활성credential/grant를정리한다. 서버폐기완료와로컬종료를UI에서구분하고연결복구시재시도,보안기록실패시종료성공주장금지. 기존온라인server-firstlogout계약보존. Nativegrant/exit/controller/routing exact세부pair는구현전별도확정한다.

필수검증: lostACK→restart/create→edit/delete→replay,同ms/순서충돌·소유권·일일20개경쟁·UTC자정·알림중복방지,저장실패·용량한도·A→B늦은응답/재시작offline·실제Androidprocesskill. F076와auth変更은독립reviewer2명,전체종료판정과구분한다.

B18-R7 추가 legacy Kakao 사진: 메인 exact `DSM_Front/src/features/product/profile-api.ts` + `.test.ts`에서 기존 http avatar를렌더링하지않고null fallback하여profile수정진입을보존한다. 신규Kakao로그인에는메인 exact `DSM_Back/src/auth/auth.service.ts` + `.spec.ts`에서공식secure_resource:true 요청옵션추가. 실제저장된http사진주소는변경하지않고사용자가안전한사진으로교체가능. root와Panel담당파일소유권분리.

B18-R7 legacy 프로필 보완: 기존 social nickname 생성은21자 이상도 가능하므로 응답에 신규 수정20자제한을 적용하면 기존 사용자가 profile GET부터 차단된다. Front 담당 단계1 exact `DSM_Front/src/features/product/profile-api.ts` + `.test.ts`: 응답 nickname은 기존 문자열을 보존(최대1024자 방어), 변경 입력만 trim1~20 제한. 단계2 exact `DSM_Front/src/components/dailyup/profile-panel.tsx` + `.test.ts`: unchanged legacy nickname의 사진만수정은허용, 신규 nickname변경은20자제한유지; legacy경계와원API20자회귀. 실제 DB 기존이름 변경/자동잘라내기 없음. 신규계정 nickname생성정책변경은요청하지않는다.

B19/B20 설정 통합 메인 exact 단계1 `DSM_Back/src/config/env.validation.ts` + `.spec.ts`: whitelist가 선택 APPLE_CLIENT_ID를 지우지 않도록 optional string 검증·빈설정미활성 계약 추가. 단계2 공개 예시 `DSM_Front/.env.example` + `.env.release.example`, 단계3 `DSM_Back/.env.example` + `DSM_Back/README.md`, 단계4 `DSM_Front/README.md`만 갱신한다. 실제 env/계정키는 읽거나 쓰지 않는다. 클라이언트에 Apple Services ID/등록 HTTPS redirect/Kakao native public key만 사용하고 private key·secret 금지. 미설정 공급자는 버튼의 안전한 설정오류이며 Google startup은 영향 없음.

Keychain 검사 복구 exact `DSM_Front/src/features/auth/token-store.native.test.ts`: 설치된 실제 패키지에 잘못 지정한 virtual:true를 제거한다. investigator의 전체545 중7실패/단독11통과와 Jest29 resolver cache가 virtualMocks를 key에포함하지않는 인메모리 재현이 근거다. 제품 Keychain 코드는 변경하지 않으며 전체 Front 회귀로 검증한다. 기존 ER-20260816-002의 cache-only 설명도 이번 근거로 메인이 갱신한다.

통합 회귀 보완: 메인 exact `DSM_Back/src/app.module.spec.ts` + `DSM_Back/src/categories/categories.controller.spec.ts`에서 신규 ProfilesModule 및 pagination query 전달 계약을 기존 기대값에 반영한다. 실제 full suite의 두 실패가 RED 근거다. 기존 allowlist `tasks/dto/task-query.dto.ts` import 서식도 nonfix lint 실패에 맞춰 정렬한다. Front Keychain의 full-suite 7실패/단독11통과는 investigator writable none으로 재현·원인을 먼저 조사한다. Android 신규 native 의존성 debug assemble은 통과했으며 실제 provider 로그인과 구형 기기 QA를 대체하지 않는다.

- 원장·공유 memory 메인 소유, exact writable1~2파일씩. 실제 env/key·recovery·차단 cache·기존 변경 보존. Git commit/push·운영 배포는 별도다.
- 기존55건 모두 포함한다. 이미 변경된 원인은 현재 증거로 검증하되 자동 종결하지 않는다. 보안·무결성·동시성은 독립 reviewer2명, 나머지는 위험에 맞는 독립 검증을 수행한다.
- 오류 재현 RED→최소 수정→GREEN. 단계 변경 뒤 해당 검사, 분야 완료 뒤 전체 관련 검사, 전체 구현 뒤 서로 다른 독립 분석을 반복한다. 새 수정 사항 없는 전체 분석2회와 필요한 실행검사를 종료 근거로 삼는다. 미검증 외부 조건은 별도 gate로 보존한다.
- 자원 상한·오류 표시·소셜/OAuth·offline 동기화는 기존 계약을 대조해 명시적 정책과 테스트를 함께 둔다. 식별자/email만으로 계정을 자동 연결하지 않는다.

## 대상 snapshot (시작55건)

| ID | 심각도 | 원장 제목 | 진행 |
|---|---|---|---|
| F-004 | P3 | 동일 이메일의 다른 provider 로그인은 unique violation 500으로 실패함 | 조사 |
| F-010 | P3 | Task date query가 UTC day 대신 입력 시각부터 24시간을 조회함 | 조사 |
| F-015 | P2 | Android notification client와 설정 기능이 아직 없음 | 조사 |
| F-018 | P2 | Expo splash·launcher와 내부 앱 이름이 사용자에게 노출됨 | 조사 |
| F-019 | P2 | 인증 runtime의 axios 1.16.1이 high advisory 대상임 | 조사 |
| F-020 | P2 | Nest Express production tree가 high advisory 대상 버전을 포함함 | 조사 |
| F-021 | P2 | Metro·React Native tooling tree에 high advisory 패키지가 남음 | 조사 |
| F-022 | P2 | 문서화한 Node 범위가 직접 test dependency engine과 충돌함 | 조사 |
| F-023 | P3 | Backend Prettier check가 66 TypeScript files에서 실패함 | 조사 |
| F-024 | P3 | Memory의 dependency audit 수치가 최신 감사와 충돌함 | 조사 |
| F-026 | P2 | Account reauth·OAuth 오류를 사용자 취소로 조용히 무시함 | 조사 |
| F-027 | P2 | 동시 최초 소셜 로그인 중 한 요청이 unique violation 500으로 실패 | 조사 |
| F-028 | P2 | 모든 delivery가 claim 검증에서 취소되면 schedule이 PROCESSING에 잔류 | 조사 |
| F-031 | P2 | 종료되지 않는 Firebase send가 전체 notification Cron을 무기한 점유 | 조사 |
| F-032 | P2 | CANCELLED 일과가 미완료로 표시되고 완료 동작으로 전환됨 | 조사 |
| F-033 | P2 | 401 자동 세션 정리 중 기존 인증 화면과 계정 데이터가 계속 노출됨 | 조사 |
| F-034 | P3 | 일일 점수 parser가 900점 상한을 검증하지 않아 모순된 응답을 ready로 게시 | 조사 |
| F-036 | P2 | release validator가 예제용 .invalid API endpoint를 운영값으로 허용 | 조사 |
| F-037 | P2 | Gradle wrapper 배포 ZIP의 기대 SHA-256이 고정되지 않음 | 조사 |
| F-038 | P3 | JSC fallback이 동적 버전을 사용해 선택 빌드가 재현되지 않음 | 조사 |
| F-042 | P2 | Category 총량과 목록 응답에 경계가 없음 | 조사 |
| F-043 | P3 | PATCH가 빈 Task title과 Category name을 허용함 | 조사 |
| F-044 | P3 | Category 동시 update/delete 경합의 P2025가 HTTP 500으로 노출됨 | 조사 |
| F-045 | P2 | 복구 가능한 refresh 실패가 기존 데이터를 지움 | 조사 |
| F-046 | P2 | Android Back이 열린 Task sheet를 닫지 않음 | 조사 |
| F-047 | P2 | 열린 Task sheet가 TalkBack focus와 배경 action을 격리하지 않음 | 조사 |
| F-048 | P3 | Dirty Task form을 확인 없이 폐기함 | 조사 |
| F-049 | P3 | Production 초기 loading이 구조적 skeleton을 사용하지 않음 | 조사 |
| F-050 | P3 | 주요 toggle과 close touch target이 44×44보다 작음 | 조사 |
| F-051 | P3 | 최대 100명 ranking을 비가상화 ScrollView로 모두 mount함 | 조사 |
| F-052 | P3 | Frontend HTTP client가 Backend 오류 envelope를 읽지 않음 | 조사 |
| F-053 | P2 | 추적된 Claude local 설정이 위험한 정확 명령을 사전 허용함 | 조사 |
| F-054 | P2 | Backend application image와 container release 절차가 없음 | 조사 |
| F-055 | P3 | Clean validation이 mutable PostgreSQL image tag에 의존함 | 조사 |
| F-056 | P2 | Offline 복구 화면에서 local logout과 계정 전환에 도달할 수 없음 | 조사 |
| F-057 | P2 | auth profile의 일시적 5xx가 유효 session과 local refresh token을 삭제함 | 조사 |
| F-058 | P3 | UTC 자정 이후 foreground refresh가 전날 Task와 점수를 계속 조회함 | 조사 |
| F-059 | P3 | timezone suffix 없는 timestamp를 parser가 허용해 기기별로 다른 시각을 만듦 | 조사 |
| F-060 | P3 | leaderboard에서 현재 사용자 행을 강조하지 않음 | 조사 |
| F-061 | P2 | refresh rotation이 폐기된 token row를 제한 없이 누적함 | 조사 |
| F-062 | P2 | Kakao 사용자 정보 검증 요청에 timeout이 없음 | 조사 |
| F-063 | P3 | Kakao 200 응답의 누락된 사용자 ID를 문자열 identity로 수용함 | 조사 |
| F-064 | P2 | release ABI override를 검증하지 않아 x86 전용 artifact를 만들 수 있음 | 조사 |
| F-070 | P2 | Backend가 모든 Apple 로그인을 무조건 거부함 | 조사 |
| F-071 | P2 | Frontend에서 Kakao 로그인은 placeholder이고 Apple 로그인은 비활성임 | 조사 |
| F-072 | P2 | 닉네임과 프로필 이미지 설정·수정 API가 없음 | 조사 |
| F-073 | P2 | Frontend onboarding과 MyPage에 nickname·profile image 편집 경로가 없음 | 조사 |
| F-074 | P2 | Backend에 WebSocket gateway와 ranking·notification broadcast 경로가 없음 | 조사 |
| F-075 | P2 | Frontend ranking 화면에 WebSocket 실시간 갱신 경로가 없음 | 조사 |
| F-076 | P2 | 오프라인 Task CRUD queue와 updatedAt 기반 LWW 동기화가 없음 | 조사 |
| F-077 | P2 | 월간·주간 캘린더와 날짜별 Task·달성률 indicator가 없음 | 조사 |
| F-078 | P2 | 카테고리별 성취 통계 화면과 데이터 요청이 없음 | 조사 |
| F-080 | P2 | 날짜를 생략한 Task 목록이 사용자 전체 이력을 제한 없이 materialize함 | 조사 |
| F-081 | P2 | 동일 FCM token 재등록이 유효 delivery를 잘못 취소함 | 조사 |
| F-082 | P2 | 사용자별 FCM token 상한이 없어 schedule별 delivery fan-out이 무제한임 | 조사 |

## A1 — 의존성 보안과 Node 실행 범위

R13-B 추가 engine 불일치: Backend `>=22`가 잠금 의존성 jwks-rsa의22.12 및 eslint-visitor-keys의22.13 최소조건을 허용하지 못한다. 메인 exact `DSM_Back/package.json` + `DSM_Back/package-lock.json` root engines를 Front와 같은 `^22.13.0 || >=24.0.0`으로 정렬하고 다음1파일 `DSM_Back/README.md` 실행조건을 명시한다. npm engine/semver 경계검증과 독립 재검토로 확인하며 실제설치버전/lock의dependency는변경하지않는다. Playbook에동일engine해결없음. 이번R13발견은사용자분석→수정승인범위다.

- [x] Backend21(11high)/Front23(8high) 현재 audit 확보; 과거 수치와 구분. 원자료 .local/all55-back-audit.json/all55-front-audit.json.
- [ ] F019/F020: axios·Nest adapter와 호환 범위 전이 의존성의 보안 업데이트를 lockfile에 반영한다. Nest11/Prisma6/Node22 유지, --force 금지. 패키지 lifecycle은 ignore-scripts로 생략하고 필요한 생성은 메인이 별도 검증한다.
- [ ] F021: RN0.83.10을 유지하면서 Metro0.83 호환/전이 보안 업데이트를 적용한다. 무조건 major downgrade/override하지 않는다.
- [ ] F022: 직접 test dependency 최소 범위와 맞게 Front Node engine/README를 고치고 lock metadata 동기화.
- [ ] 새로운 audit 비교·Backend/Front unit/type/lint·Metro bundle/Android build로 ABI/런타임 호환 확인, 독립 검토.

Exact write batches: `DSM_Back/package.json` + `DSM_Back/package-lock.json`; `DSM_Front/package.json` + `DSM_Front/package-lock.json`; 이후 `DSM_Front/README.md` 문서1개. 승인 범위에 필요한 npm install/update는 메인만 실행하며 생성 lockfile은 package metadata와 함께2파일 한 묶음이다. 기존 Backend start:prod를 보존한다.

A1 결정: 자동 호환 업데이트 뒤 Nest11.2.3/axios1.20.0로 최소 버전을 올리고 adapter가 exact pin한 multer2.2.0을 scoped override2.3.0으로 고정한다. RN0.83.10은 유지, 공식 Metro0.83.8이 취약 image-size를 제거하므로 metro/metro-config를 해당 patch로 고정한다. Front engine은 test dependency에 맞는 ^22.13.0||>=24.0.0. Prisma6.19.3의 deepmerge-ts3개 연쇄 경고와 Front12 moderate는 현재 잔여 advisory로 별도 기록하며 audit0으로 주장하지 않는다. 메이저 강제 downgrade는 사용하지 않았다.

## A2 — 릴리스 입력·재현성·브랜딩/로컬 권한

- F036/F064 exact test `DSM_Front/android/release-config.test.groovy`에서 .invalid(대소문자/끝점 포함) API와 ARM64 없는/알 수 없는 ABI 목록을 RED. 이어 `DSM_Front/android/release-config.gradle` + `DSM_Front/android/app/build.gradle`에서 해당 검증·실제 property 연결. arm64-v8a 필수, 지원 ABI 4종 안의 비어 있지 않은 집합. Debug override는 유지한다. 양성 fixture는 public형 example.com이며 실제 접속하지 않는다. 공식 Groovy runtime으로 검사한다.
- F037 exact `DSM_Front/android/gradle/wrapper/gradle-wrapper.properties`: Gradle 공식9.0.0-bin SHA256 8fad3d78296ca518113f3d29016617c7f9367dc005f932bd9d93bf45ba46072b 고정, 공식 endpoint와 대조.
- F038 exact `DSM_Front/android/app/build.gradle`: Maven Central 제공 JSC2026004.0.1로 wildcard를 고정한다. 기본 Hermes 유지, 선택 dependency 해석 검증.
- F018 exact 단계: `DSM_Front/android/app/src/main/res/values/strings.xml` + 신규 `DSM_Front/android/app/src/main/res/drawable/dailyup_icon.xml`; 다음 `DSM_Front/android/app/src/main/AndroidManifest.xml` + `DSM_Front/android/app/src/main/res/values/styles.xml`. DailyUp 이름·기존 색감의 체크/상승 vector를 active launcher/splash에 연결한다. 기존 미사용 bitmap은 보존, APK/에뮬레이터 cold start 확인.
- F053 exact `.claude/settings.local.json`의 permissions.allow만 비워 저장소에서 Git push/global install 등을 사전허용하지 않도록 한다. 다른 key는 보존, 실제 명령을 실행하지 않는다. `.gitignore` 변경 없이 추적된 보호 설정 자체를 공유한다.
- F022 README exact `DSM_Front/README.md`; F023 현재 전체 nonfix Prettier 검사, 실제 남은 파일은 확인 후 exact 범위를 추가한다. F024 audit 전/후 수치를 현재 memory와 구분해서 갱신한다.
- Helper exact `.local/all55-release.ps1`, logs `.local/logs/all55-release-red.log`, `.local/logs/all55-release-green.log`; `.local/all55-back-audit-after.json`, `.local/all55-front-audit-after.json`. OS temp 합성 fixture는 기존 Groovy test가 생성/정리하며 실제 signer/env를 읽지 않는다.

## 조사/구현 순서

1. 메인: A1과 릴리스/도구 F018/023/024/036/037/038/053/054/055/064.
2. Backend 기존 로직: auth(Kakao 유효성/timeout/가입 race/email conflict)→Task/Category 경계→알림 claim/lease/token→retention/capacity.
3. Front 기존 동작: 인증 복구/노출→HTTP 오류/상태·날짜→Task sheet/접근성→목록/로딩/강조.
4. 기능: profile API→profile UI, provider 검증/로그인, notification settings/client, authenticated socket→ranking refresh, durable offline protocol→queue, calendar/statistics.
5. 분야별 exact source/test 계약은 조사 결과를 반영해 아래에 추가한 뒤 코드 수정한다. 구현 완료 뒤 독립 분석자가 전체 변경에서 새 결함을 찾고 수정 후 재분석한다.

## A3 — Backend container release와 DB image (F054/F055)

Exact pairs: 신규 `DSM_Back/Dockerfile` + `DSM_Back/.dockerignore`; 신규 `DSM_Back/docker-entrypoint.sh` + 기존 `DSM_Back/README.md`; 기존 `DSM_Back/compose.yaml` 1파일. 공식 Node22-bookworm-slim index digest83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5를 base로 사용하고 build→nonroot runtime에 같은 lock/schema/migrations/Prisma CLI를 포함한다. Entrypoint는 migrate deploy 성공 뒤 exec node로 전달하며 실제 env는 runtime에만 주입한다. Context에서 env·key·Git·local cache를 제외한다. PG17은 현재 검증한 공식 digest18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73로 고정한다. 기존 dev container/volume는 재생성하지 않는다.

검증: 메인 Docker build tag dsm-all55-back:20260911, task label dsm.all55=20260911의 PG/Backend 컨테이너만 합성 env로 실행. migrate 실패 차단·HTTP health/ready·nonroot·secret context제외 확인. container port127.0.0.1:55348(PG)/53018(Backend), 네트워크 dsm-all55-20260911. 실제 운영 배포 아님. Helper exact `.local/all55-container.ps1`, 로그 `.local/logs/all55-container-build.log`, `.local/logs/all55-container-runtime.log`. Task 생성자원만 label확인 후 정리하며 기존 DB/Redis·실제env는 보존한다.

## B1 — 세션 즉시 차단·profile 일시 장애 (F033/F057)

Exact writable: `DSM_Front/src/features/auth/session-controller.ts`, `DSM_Front/src/features/auth/session-controller.test.ts`. Front 구현자 단독 소유. Auth epoch/access를 폐기할 때 await readAndClear 전에 기존 recovering/bootstrapping 상태를 게시해 보호 화면을 즉시 내린다. 5xx profile 실패는 network/timeout처럼 token 보존·재시도 상태다. 401은 cleanup, stale 완료는 현재 epoch에 게시하지 않는다. signIn/bootstrap/retry와 onboarding의 동일 실패 분기를 대조한다. RED 지연/실패/영구 pending cleanup·500/502/503→성공·계정 전환→최소 수정→회귀/type/nonfixlint. provider 통합 검증 경계는 다음 단계에서 추가한다.

## B2 — 소셜 가입 경쟁·Kakao 검증 (F004/F027/F062/F063)

Exact writable: `DSM_Back/src/auth/auth.service.ts`, `DSM_Back/src/auth/auth.service.spec.ts`. Backend auth 구현자 단독 소유. P2002 뒤 동일 provider identity winner 재조회→반환; 없으면 email conflict409, nickname 충돌만 bounded retry, 다른DB오류 보존. 이메일 자동 계정 연결 금지. Kakao id는 양의 safe integer만 인정하고 DB 접근 전 거부. axios timeout와 AbortController 전체 deadline(5초), finally timer 정리. 실제 provider 요청은 하지 않는다. RED 동시 winner/다른emailprovider/invalid id/timeout→GREEN. 실제 PG 동시성은 후속 exact test로 메인이 검증한다.

## B3 — 알림 claim 집계·send deadline (F028/F031)

Exact writable: `DSM_Back/src/notifications/notification-dispatcher.service.ts`, `DSM_Back/src/notifications/notification-dispatcher.service.spec.ts`. Backend notification 구현자 단독 소유. Claim 단계에서 취소한 schedule ID를 보존해 빈 claim에서도 집계하고 stale recovery terminalization 경로도 점검한다. Send deadline30초는 heartbeat lease5분보다 짧게 두고 timeout은 기존 ambiguous UNKNOWN 정책으로 종결·집계·heartbeat 정리한다. SDK underlying 요청의 취소 불가능성과 late result를 구분하며 late resolve/reject는 상태를 바꾸거나 재전송하지 않는다. RED all cancelled/partial/stale recovery/hang/deadline/late settlement→GREEN, provider data-only 중립 payload 보존.

각 구현자는 정확한 위2파일만 apply_patch로 수정하며 공유 memory/원장/의존성/DB는 쓰지 않는다. 메인이 dependency 업데이트 종료를 확인한 뒤 Jest --runInBand --no-cache와 noEmit/nonfix lint를 수행한다. 개별 구현 완료 뒤 별도 reviewer가 판단한다. 조사상 F056 offline local logout과 F061 무제한 rolling refresh는 기존 보안 계약과 충돌해 추가 정책 설계가 필요하며 작업에서 제외하지 않는다.

## B4 — 응답 점수·시간 계약 (F034/F059)

Exact writable `DSM_Front/src/features/product/product-contracts.ts` + `DSM_Front/src/features/product/product-contracts.test.ts`. 일일 cappedScore만0~900, 누적/summary900초과 허용. timestamp는 ISO의 Z/명시적 ±HH:mm offset을 요구하고 실제 Date.parse 유효성을 함께 확인한다. UTC instant normalization과 기존 parser 반환 계약을 대조해 불필요한 표현 변환은 피한다. Task startAt/endAt/completedAt, scoreDate 등 동일 helper 경로 모두 검증. RED901/NaN/음수·suffix없음/invalidoffset→GREEN 경계0/900·±offset·nullnullable·누적점수. 독립 Front 담당2파일, session/HTTPstore는 읽기만 한다.

## B2-PG / A3 실행 보충

## B5 — 빈 PATCH 이름 거부 (F043)

메인 exact 단계1 신규 `DSM_Back/test/name-input.e2e-spec.ts`: 실제 configureApp/Task·Category controllers에서 POST/PATCH 빈 title/name400·서비스 미호출, 정상/생략 PATCH 보존을 RED. 단계2 `DSM_Back/src/tasks/dto/update-task.dto.ts` + `DSM_Back/src/categories/dto/update-category.dto.ts`: create와 같은 IsNotEmpty를 추가한다. 공백 trim/null 정책은 이 finding의 범위 밖 기존 계약을 보존한다. F041/F079의 날짜·boolean 검증 변경을 보존한다. 현재 E2E/정확한 nonfix lint/noEmit 검사 뒤 독립 검토한다.

## B2-PG / A3 세부

## B6 — Front 데이터 보존·오늘 추적·취소 상태 (F045/F058/F032)

## B3-R1 — 집계 실패 재발견 (F028 독립 재검토 실패)

메인 exact `DSM_Back/src/notifications/notification-dispatcher.service.ts` + `.spec.ts`: 매 tick PROCESSING 일정 중 delivery가 존재하고 비종결 delivery가 없는 것을 stable createdAt/id순 최대100개 조회해 집계한다. 실패해도 DB에 조건이 남아 다음 tick/프로세스가 재발견한다. 기존 즉시 집계와 UNKNOWN/no-resend·claimfencing을 보존한다. RED terminal commit→aggregate 1회 실패→다음 정상tick종결 및 조회 상한/비종결 형제 보호를 검증한다. F031 transport종료 문제는 별도 provider 경계 설계로 처리한다.

## B6 세부

## B7 — 추가 인증 결함 F086/F087

## B3-R2 — 종료 가능한 Firebase SDK 전송 (F031)

Promise deadline만으로 underlying SDK를 종료하지 못해2개hang시capacity가 고착되는 독립검토를 반영한다. 기존 Firebase Admin/ADC를 유지하고 SDK 전송만 Node22 worker thread에서 실행한다. Worker는 batch마다 생성하여25초 deadline에 terminate하고 종료를 확인한 후 capacity를 반환한다. Dispatcher30초 deadline/UNKNOWN/no-resend는 최종 방어이며 실제SDKworker가25초에종료되어 영구pending누적이없도록 한다. 새서비스/외부credential/의존성추가없음. Worker시작비용·ADC클라이언트재생성 비용이 생기며 실제FCM latency는외부검증gate다.

Exact 단계1 `DSM_Back/src/notifications/firebase-messaging.provider.ts` + `firebase-messaging.provider.spec.ts`: 초기 enabled/project/defaultApp 검증보존, Worker lifecycle success/error/exit/timeout/late outcome/동시호출상한/종료후다음send 회귀. 단계2 신규 `DSM_Back/src/notifications/firebase-messaging.worker.ts` 1파일: ADC/project 초기화, SDK send, 구조화된 결과의 success/messageId/error.code만 parent에반환; token/credential/rawSDKdetail로그금지, stdout/stderr는parent로자동출력하지않음. 메인 실제worker 종료probe exact `.local/all55-worker-probe.cjs` + `.local/all55-worker-fixture.cjs`, testfixture는합성pending/CPUloop/성공만,실제FCM외부요청없음. Node22 공식 Worker.terminate의 exit완료Promise 계약 적용. SDK취소는worker종료로보장하되 이미전송된요청의결과는UNKNOWN이고재발송금지.

독립 finder2명과 별도 validator2명이 실제 소스 메모리 probe로 두 조건을 확인했다. 사용자 분석→수정 반복 승인 안에서 추가 수정한다. F086 exact `DSM_Front/src/lib/api/authenticated-client.ts` + `authenticated-client.test.ts`: replay401 catch에서도 현재 access가 replay token과 일치할 때만 unauthorized cleanup, stale실패는 원 요청에만 반환. 정상 replay401 cleanup은 유지. F087 exact `DSM_Front/src/features/auth/session-controller.ts` + `session-controller.test.ts`: loadProfile의 동일 epoch 정상 token rotation은 성공으로 허용하고 계정전환/logout stale epoch, refresh실패 정리 fence 유지. 실제 authenticated-client와 연결한 회귀를 추가해 profile503→retry401→rotation→200 한번에authenticated를 확인한다. 각각 TDD/type/nonfixlint 후 구현자와 분리된 재검증2명.

## B6 구현 상세

## B8 — Task UTC 조회 / Category 경합 오류

## B6-UI — Home 데이터 보존·skeleton·취소 표시 (F045/F049/F032)

## B9 — Task sheet Android Modal·dirty 확인 (F046/F047/F048/F032)

## B10 — 공통 터치 영역 (F050)

메인 exact `DSM_Front/src/components/dailyup/primitives.tsx`: IconButton실제44×44,AppToggle실제44×44 Pressable안에기존38×23시각track배치. checked/disabled접근성·클릭동작보존. 단순style구현을복제하는새unit는추가하지않고기존form/UI회귀와type/lint,실제디바이스bounds를검증한다. 불필요한memo/추상화추가없음.

## B11 — 랭킹 가상 목록과 본인 표시 (F051/F060)

## B12 — Google 미완료 결과 피드백 (F026)

## B13 — 안전한 Backend 오류 envelope (F052)

## B7-R3 — 같은 epoch의 겹친 profile 요청 (F087 재검토 실패)

## B15 — 목록 상한과 커서 (F042/F080)

## B16 — 캘린더·통계 (F077/F078)

Backend PG 작성 exact 신규 `DSM_Back/test/score-analytics.pg-spec.ts` 1파일. 동일격리DBmarker/URL검증,소유fixture만cleanup. 실제SQL로category/null/foreign owner/deleted/PENDING/CANCELLED/다른UTC일완료/범위양끝 및DailyScorezero-fill/Decimalrate를검증한다. 기존유저/실제데이터변경없음. 메인이실행한다.

## B17 — Refresh family 보존 기한 (F061)

## B18 — 프로필 닉네임·사진 (F072/F073)

## B19 — Apple token 서버 검증 (F070)

## B20 — Android Kakao·Apple 로그인 연결 (F071)

기존로그인버튼에서실제nativeprovider획득→SessionController.signIn(provider,token)으로연결한다. @react-native-kakao/core/user2.4.6, @invertase/react-native-apple-authentication2.5.1의공식Android지원사용. 설정누락/취소/실패/동시호출분류,rawprovider오류·token로그금지. KAKAO_NATIVE_APP_KEY공개앱키32hex,APPLE_CLIENT_ID와HTTPS APPLE_REDIRECT_URI외부콘솔등록이필요하며현재미제공gate. AppleAndroidSDK의native state/nonce생성·응답검증을설치source에서확인하고PKCE/nonce확인이없는동작을임의로주장하지않는다.

메인 package단계 exact `DSM_Front/package.json` + `package-lock.json`. Front adapter단계 신규 `DSM_Front/src/features/auth/additional-sign-in.ts` + `additional-sign-in.test.ts`; contract단계 `DSM_Front/src/lib/api/auth-contracts.ts` + `auth-contracts.test.ts`에APPLE허용(실제testpath확인); UI단계 `DSM_Front/src/app/index.tsx` + `DSM_Front/src/__tests__/app/index.test.tsx`: 세provider공유pendingguard·취소안내·실제session호출. Native단계 exact `DSM_Front/android/build.gradle` + `DSM_Front/android/app/proguard-rules.pro` Kakao공식repository/규칙; 다음pair `DSM_Front/android/app/build.gradle` + `DSM_Front/android/app/src/main/AndroidManifest.xml` validatedKakao앱키scheme/미설정disabledactivity. 공개샘플설정/README정확경계는후속추가. 실제계정/서명/redirect 성공검증은외부gate,Google기존계약보존.

공식참고 https://rnkakao.mjstudio.net/docs/install-android /docs/user/intro-android /docs/user/login, https://github.com/invertase/react-native-apple-authentication.

기존Google/Kakao socialidentity계약으로Apple provider를연결한다. APPLE_CLIENT_ID(Services ID)설정시에만활성,실제등록값미제공은외부gate. Apple공식JWKS endpoint의RSA/RS256/kid키로서명·iss=https://appleid.apple.com·aud=설정ID·exp·sub검증,검증된email만저장하고이메일계정자동연결금지. 임의JWT키/URL사용금지. JWT≤16KiB,JWKS≤64KiB/10키,5초abortdeadline,5분cache/동시singleflight,unknownkid재조회최소30초로제한한다. 신규라이브러리없이Nodecrypto/JwtService/axios현재버전사용.

Backend 단계1 exact 신규 `DSM_Back/src/auth/apple-token.verifier.ts` + `apple-token.verifier.spec.ts`,실제RSA/JWT fixture로signature/issuer/audience/expired/sub/alg/key/verifiedemail/cache/timeout회귀. 단계2 메인 exact `DSM_Back/src/auth/auth.service.ts` + `auth.service.spec.ts`에서기존verifyAppleToken스텁을helper.verify로대체,constructor에현재Config/JWT를전달해독립helper생성,기존생성자3인자계약보존. 단계3 config공개example/문서는정확경계별도. 실제Apple계정·redirect·release서명검증은외부gate로남긴다.

## B3-R5 — Worker Retry-After 보존 (F031 재검토 실패)

독립reviewer actualsource probe에서SDKretryAfter7200초가worker/provider code-only 경계뒤60초fallback으로바뀜을확인했다. 메인 단계1 신규 `DSM_Back/src/notifications/firebase-retry-after.ts` + `firebase-retry-after.spec.ts`: code외rawSDK객체를옮기지않고기존direct retryAfter/positive retryAfterMs/header/response.header의유효한미래시각만숫자retryAfterMs로정규화한다. 단계2 exact `firebase-messaging.provider.ts` + `firebase-messaging.provider.spec.ts`: worker의양의유한retryAfterMs만복원해dispatcher기존contract로전달한다. 단계3 exact `firebase-messaging.worker.ts` + 신규 `firebase-messaging.worker.spec.ts`: 실제worker entry실행mock으로안전metadata보존/비밀필드미전달확인. 기존namespaceprefix는모두DSM_Back/src/notifications/이며파일별편집1~2개. 알림전체unit/build/실제workerprobe/독립재검토후F031판정, 이전FAILED이력보존.

## B18 상세

FR01 기존요구범위로GET/PATCH /profile authenticated owner API를추가한다. 기존User nickname/profileImageUrl필드사용,사진은DB저장된작은JPEG data URL. 외부storage선택/credential없이실제영속저장을구현한다. 입력base64최대65536자(48KiB),sharp limitInputPixels2MP/동시처리2상한/128×128inside/autoOrient/jpeg70,출력최대16KiB;JPEG/PNG실제decode만허용,메타데이터보존옵션없음. 원본/EXIF/GPS미저장. outputdataURL이leaderboard100행시최대약2.2MB더해지는tradeoff,추후blobstorage이전가능하나이번schema변경없음. null사진삭제,생략보존,닉네임trim후1~20자/unique409,owner404/invalid400. requestglobal100kb제한유지.

메인 dependency 단계 exact `DSM_Back/package.json` + `package-lock.json` sharp0.35.4; Front pair `DSM_Front/package.json` + `package-lock.json` react-native-image-picker8.2.1. Backend 단계1 신규 `DSM_Back/src/profiles/profiles.service.ts` + `profiles.service.spec.ts`; 단계2 신규 `DSM_Back/src/profiles/dto/update-profile.dto.ts` + `profiles.controller.ts`; 단계3 신규 `DSM_Back/src/profiles/profiles.module.ts` + `DSM_Back/src/app.module.ts`; 단계4 신규 `DSM_Back/test/profile.e2e-spec.ts`. Front 단계1 신규 `DSM_Front/src/features/product/profile-api.ts` + `profile-api.test.ts`; 단계2 신규 `DSM_Front/src/components/dailyup/profile-panel.tsx` + `profile-panel.test.tsx`; 단계3 `DSM_Front/src/app/(tabs)/mypage.tsx` + `DSM_Front/src/__tests__/app/tabs/mypage.test.tsx`. Android nativepicker빌드/권한미요청PhotoPickerbackport는실제설치공식문서에맞춰추가exact경계후검증한다. UI async owner/epochunmountguard,중복save/picker방어,dirty보존·오류재시도. 모든편집1~2파일.

공식근거: https://github.com/react-native-image-picker/react-native-image-picker (maxWidth/maxHeight/includeBase64/PhotoPicker), https://sharp.pixelplumbing.com/api-constructor/ (limitInputPixels), https://sharp.pixelplumbing.com/api-output/ (기본metadata제거). npm registry현재버전/engine Node>=20.9확인. Node22/RN0.83 Android에서실제build후판정.

## B9-R4 — 편집중 자정 모드전환 회귀 (F048/F058)

독립reviewer의 actualsource 메모리probe에서 editingTask가 refresh로tasks=null일때null이되어TaskSheetskey가task.id→new로바뀌고수정입력이사라지며create로전환됨을확인했다. 기존editingId→현재목록find대신편집시점TaskView snapshot을유지하고닫기/성공save/새폼열기만clear한다. 메인 exact `DSM_Front/src/features/product/product-context.tsx` + `product-context.test.tsx`, API/owner/epochunmountfence와pendingguard보존. 실제Provider/Store로편집열기→UTCdayrefresh→기존폼ID/title/mode유지RED→GREEN. stale task 삭제서버404는기존오류UI로처리하고실제mode를new로바꾸지않는다. F047은TalkBack이며이회귀는F048dirty입력보존미완료로판정한다.

## B17 상세

PG test 작성 exact 신규 `DSM_Back/test/auth-retention.pg-spec.ts` 1파일. 동일격리URL/marker,fixtureUser만cleanup,cleanup전소유외expiredcandidate없음확인. 실제AuthService/Prisma/bcrypt/JWT로만료7일경계/활성familypredecessor보존/500행상한/절대TTL회전/4096상한/expiredpredecessorlogout후정리를검증한다. 메인만DB실행,실제provider요청없음. 코드확정후기존socialPG3도회귀한다.

기존 predecessor token으로같은familylogout가능한보안계약을보존하면서family절대수명을최초발급부터30일로고정한다. 회전4096회상한을두어한family의무제한증가를차단하고상한도달시재로그인이필요하다. 새로운로그인도Userrowlock안에서token발급하여정리/로그아웃과직렬화한다. 기존family는가장오래된row의expiresAt을기준으로후속만기연장을중단한다. 매시간최대500행씩 만료후7일경과 + 같은family에유효active후속token없음 조건으로정리한다. predecessorhash는활성family동안절대삭제하지않는다. 과거무한슬라이딩세션이30일후재로그인필요로바뀌는명시정책이다.

Backend exact 단계1 `DSM_Back/src/auth/auth.service.ts` + `auth.service.spec.ts`: family수명/회전상한/로그인lock/정리SQLcron 및회귀,기존인증계정삭제/refresh경합/소셜정합성보존. schema/dependency추가없음. 필요외부문서config는후속exact경계. 실제PG보존/삭제/refresh·logoutrace는후속test별도계획하며구현자는변경제품을독립종결하지않는다.

## B16 상세

응답 scope를명시한다: calendar `{userId,from,to,days:[{date,registeredTaskCount,completedTaskCount,achievementRate,cappedScore}]}`, category `{userId,from,to,categories:[{categoryId,name,color,registeredTaskCount,completedTaskCount,achievementRate,rawScore}]}`. 날짜는YYYY-MM-DD,rate는숫자0~100,미분류categoryId=null/name='미분류'/color='#888888'. Front는요청한owner/range/정확한날짜개수/순서·counts를검증하며다른scope를게시하지않는다.

기존 FR06/07 누락 구현. GET /scores/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD: 양끝포함 최대42UTC일, 날짜당 등록/완료수·달성률·cappedScore, 빈날짜0. GET /scores/categories 같은범위: 소유/미삭제Task만 category/null bucket, 이름/색/등록·완료수/달성률/난이도 rawScore. 완료점수는기존정책과같이task시작UTC일에완료된것만계산하고capped점수를카테고리에임의분배하지않는다. 잘못된달력일/역전/43일이상400. 조회량은calendar42행/범위SQL집계로제한한다. 새schema/dependency없음.

단계1 Backend exact `DSM_Back/src/scores/scores.service.ts` + `scores.service.spec.ts`: 타입반환·범위검증·배열0채움·ownerfilter/집계/경계회귀. 단계2 메인 exact 신규 `DSM_Back/src/scores/dto/score-range-query.dto.ts` + `DSM_Back/src/scores/scores.controller.ts`, 단계3 신규 `DSM_Back/test/score-range.e2e-spec.ts` HTTP검증. Front 단계1 신규 `DSM_Front/src/features/product/analytics-api.ts` + `analytics-api.test.ts`: 엄격응답검증·UTC범위생성·요청. 단계2 신규 `DSM_Front/src/components/dailyup/calendar-panel.tsx` + `calendar-panel.test.tsx`: 월/주 전환,이전/다음/오늘,44이상날짜target와등록/달성인디케이터,selecteddate→store.setDate,scope변경요청generationfence. 단계3 신규 `DSM_Front/src/components/dailyup/statistics-panel.tsx` + `statistics-panel.test.tsx`: 최근7일점수bar+text/categoryrawScore와달성률,loading/error/retry/empty,owner/epochunmountfence. 단계4 exact `DSM_Front/src/app/(tabs)/index.tsx` + `DSM_Front/src/app/(tabs)/mypage.tsx`: Homecalendar연결/MyPage통계실제표시. 이후 기존UI회귀에 필요한 exact `DSM_Front/src/__tests__/app/tabs/product.test.tsx` 및 `DSM_Front/src/__tests__/app/tabs/mypage.test.tsx`는 실제 파일존재확인후수정한다. 모든 편집1~2파일.

## B15 상세

PG test 작성 exact 신규 `DSM_Back/test/list-pagination.pg-spec.ts` 1파일. auth-PG와동일격리URL/marker gate,랜덤생성소유fixture만정리. 실제Task/Category서비스로 205행순회/동일정렬키/마이크로초timestamp/외부owner·deleted/datecursor404,개인49→동시2create→50및default제외cap를검증한다. DB기존행변경없음,메인만실행. 생성cap를우회한legacyfixture는 Prisma직접합성삽입으로제한한다.

정밀도 보완: timestamptz(6)를 JS Date(ms) tuple로 비교하면 sub-ms 행을 재포함할 수 있다. cursor를 같은 owner/filter의 findFirst로 검증한 뒤 Prisma native cursor:{id}/skip:1와동일where/stableorderBy를사용해 DB정밀도를보존한다. 아래 초기 tuple계획을이선택이대체한다. 조회중동시삽입/삭제/정렬키변경의snapshot일관성은보장하지않으며중복은Frontprotocol오류로방어한다.

기존 배열 응답과 날짜 생략 all-history 의미를 유지하면서 요청당 기본/최대100행, UUID cursor 기반 순회를 추가한다. Category 개인 생성은 사용자 row lock+Serializable retry 안에서50개 상한409, 기존 데이터 삭제 없음. Category 순서는 isDefault desc/createdAt asc/id asc, Task는 startAt asc/id asc이며 cursor는 같은 소유권·필터 안에서 확인하고 없거나 다른 사용자면404. Front는 페이지가100미만일 때까지 순회하며 중복 cursor/최대100페이지를 막아 서버 이상으로 무한 요청하지 않는다.

메인 단계1 exact `DSM_Back/src/tasks/dto/task-query.dto.ts` + 신규 `DSM_Back/src/categories/dto/category-query.dto.ts`: limit 정수1~100과 cursor UUID 검증. Backend A 단계2 exact `DSM_Back/src/tasks/tasks.service.ts` + `tasks.service.spec.ts`: bounded findAll/안정된 순회/소유권/날짜/삭제 cursor 회귀. Backend B 단계2 exact `DSM_Back/src/categories/categories.service.ts` + `categories.service.spec.ts`: cap와 페이지/경합/기존 오류 계약. 메인 단계3 exact `DSM_Back/src/categories/categories.controller.ts` + 신규 `DSM_Back/test/list-query.e2e-spec.ts`: DTO 연결/HTTP 검증. 메인 단계4 exact `DSM_Front/src/features/product/product-api.ts` + `product-api.test.ts`는 실제 파일 확인 후 연결한다. 필요한 경로가 다르면 편집 전에 이 계획에서 정정한다. 실제 PG 페이지/동시 cap는 후속 별도 test 경계로 기록한다.

## B14-PG — 실제 알림 lifecycle 검증

Backend test 작성자 exact 신규 `DSM_Back/test/notifications-lifecycle.pg-spec.ts` 1파일. 기존 auth PG test와 같은 ALL55_DISPOSABLE_DB_TEST=1 및 loopback55348/all55_ URL gate. 실제 NotificationsService·Prisma로 동시10개상한, heartbeat generation보존, revoke/reactivation ABA, 타사용자소유권을 검증한다. 실제 Dispatcher의 private 메서드를 test-bound typed bridge로 호출할 수 있으며 materialization legacy20→10행, terminal delivery commit 후 aggregate실패→다음tick복구, neutral Firebase mock만 허용한다. fixture소유 User만cleanup, 메인이 DB실행하며 외부 FCM 요청 없음.

## B14 — FCM 등록 generation·사용자 상한 (F081/F082)

## A2-F023 — 남은22개 TypeScript 서식

기록검증 메인 helper exact `.local/all55-verify.cjs`: 현재원장schema/중복ID/fingerprint와신규F086087basis해시,활성memory UTF8/해시출력. 실제env/recovery는읽지않고파일수정도하지않는다. 과거hardcoded counts helper는실행하지않는다.

메인 아래 exact files를1~2개씩현재Prettier설정으로정렬한다. 논리수정없음,원본/source순서보존. helper exact `.local/all55-format.cjs`는formatter결과를stdout으로반환만하고메인이apply_patch로쓴다. 신규 `DSM_Back/.gitattributes`는 *.ts text eol=lf로Windows재checkout의LF변환계약을고정한다. 현재Prettiercheck22warnings가RED근거,전체format/lint/type/unit후독립범위검토.

`DSM_Back/src/app.controller.spec.ts`, `DSM_Back/src/app.controller.ts`, `DSM_Back/src/app.service.ts`, `DSM_Back/src/auth/dto/refresh-token.dto.ts`, `DSM_Back/src/auth/dto/social-login.dto.ts`, `DSM_Back/src/auth/dto/token-response.dto.ts`, `DSM_Back/src/auth/types/social-profile.type.ts`, `DSM_Back/src/categories/categories.controller.ts`, `DSM_Back/src/categories/dto/create-category.dto.ts`, `DSM_Back/src/common/filters/http-exception.filter.ts`, `DSM_Back/src/main.ts`, `DSM_Back/src/prisma/prisma.module.ts`, `DSM_Back/src/prisma/prisma.service.spec.ts`, `DSM_Back/src/prisma/prisma.service.ts`, `DSM_Back/src/rankings/dto/leaderboard-query.dto.ts`, `DSM_Back/src/rankings/dto/ranking-query.dto.ts`, `DSM_Back/src/rankings/rankings.controller.ts`, `DSM_Back/src/rankings/rankings.policy.spec.ts`, `DSM_Back/src/rankings/rankings.policy.ts`, `DSM_Back/src/scores/dto/score-query.dto.ts`, `DSM_Back/src/scores/scores.controller.ts`, `DSM_Back/src/tasks/dto/task-query.dto.ts`.

Backend 담당 exact `DSM_Back/src/notifications/notifications.service.ts` + `notifications.service.spec.ts`: 사용자 row lock안에서등록/폐기,같은owner활성token재등록은lastSeenAt/platform/device만갱신하고updatedAt generation보존. 폐기시에도generation보존,reactivation은max(now,old.updatedAt+1ms)로증가시켜같은ms ABA방지. 신규/재활성등록은active10개한도409; 기존active heartbeat는한도초과legacy에도허용. 사용자변경자동이전금지. 공개상수 MAX_ACTIVE_FCM_TOKENS=10을같은service에두고메인이dispatcher와공유. 기존Serializable retry계약보존,실제PG동시cap/ABA후속검증.

메인 후속exact `DSM_Back/src/notifications/notification-dispatcher.service.ts` + `.spec.ts`: materialization도token10개상한으로legacyfanout차단,안정된최근lastSeenAt/id순. invalidtoken revoke는조건에사용한tokenUpdatedAt을그대로유지해generation역행방지. 현재영구SDKhang수정/집계reconciliation·data-only중립payload보존. 테스트active재등록보존/한도경계/동시충돌retry/폐기·즉시재활성generation,materialization상한과invalidcode처리. 등록용상한은도메인정책선택이며50개100개무한fanout대신개인계정10기기수용으로설정했다.

메인 기존exact `DSM_Front/src/features/auth/session-controller.ts` + `session-controller.test.ts`: profile operation generation을추가해더새로운loadProfile이시작된뒤의이전성공/실패모두무시한다. epoch/accountswitchfence병용,loadProfile이아닌onboarding error경로는보존. 실제client연결로503→retry1/401/rotation/replay대기→retry2/401/rotation/200authenticated→늦은retry1의401및200각각현재세션보존RED→GREEN. 단순accessToken동일성으로되돌리지않고정상rotation복구와겹친요청둘다검증한다.

메인 단계1 exact `DSM_Front/src/lib/api/http-client.ts` + `http-client.test.ts`: HTTPstatus는원응답기준으로확정하고오류body읽기/JSON실패가401분류를덮어쓰지않는다. 오류body metadata처리250ms대기·8192자수용상한,큰Content-Length사전거부,deadline시abort,필요한allowlisted message→기존ApiError.code로변환. rawmessage/path/timestamp/constraints/token은ApiError/UI에넣지않는다. RNtextfallback은다운로드자체의hardbytecap을보장하지않음을기록. exactknowncode TASK_DAILY_LIMIT/CATEGORY_NAME_CONFLICT/INVALID_TIME_RANGE/VALIDATION_FAILED,unknown은기존일반메시지. 단계2 exact `DSM_Front/src/features/product/product-store.ts` + `product-store.test.ts`: 위code별안전한한국어피드백,기존statusfallback·데이터보존계약유지. RED HTTPknown/malformed/oversize/readfail/hang401→GREEN,기존retry/session통합회귀.

메인 exact `DSM_Front/src/app/index.tsx` + `DSM_Front/src/__tests__/app/index.test.tsx`: native cancelled가실제취소와재인증/설정실패를구분하지못하므로실패원인을단정하지않는미완료안내와재시도/계정재인증도움을표시한다. provider adapter분류·backend교환미호출·pending중복방어보존. 기존silentcanceltest를RED로바꾼뒤UI분기추가,현재로그인전체회귀. 실제Googleprovider환경진단은외부gate.

Front exact `DSM_Front/src/app/(tabs)/ranking.tsx` + `DSM_Front/src/__tests__/app/tabs/product.test.tsx`: ScrollView전체map을 단일FlatList로교체하고header/empty/separator에기존요소연결,stableuserIdkey와현재store.userId행에명시'나'표시·접근성label·색강조. 초기render/window/배치상한을두며period변경·빈/error/cache갱신·자기행위치구분을보존한다. 기존UItest에100명초기전체mount방지및본인행표시/다른계정/period변경회귀추가. 원본Home/formtests보존.

Front 담당 exact `DSM_Front/src/components/dailyup/task-sheets.tsx` + 신규 `DSM_Front/src/components/dailyup/task-sheets.test.tsx`. 기존overlay를 투명 native Modal로감싸 Android Back을 onRequestClose 공통닫기로연결하고모달윈도우로배경접근/입력을격리한다. initialfocus/의미있는dialoglabel과접근성속성추가,실제TalkBackfocus복귀는기기gate. form원본필드 snapshot과현재값비교로수정여부를판정하고닫기버튼/backdrop/Back모두같은discard확인 Alert경로를사용한다. pending저장중닫기차단, 성공저장만확인없이닫는다. detail은CANCELLED명시label/완료disabled,수정삭제는보존. RED Back/clean/dirty취소·폐기/pending/취소task를확인하고GREEN/type/nonfixlint. product.test.tsx는Home담당소유이므로읽기만한다.

메인 exact `DSM_Front/src/components/dailyup/screen-state.tsx`에서 기존 LoadingState를 export만 한다. Front 담당 exact `DSM_Front/src/app/(tabs)/index.tsx` + `DSM_Front/src/__tests__/app/tabs/product.test.tsx`: 첫 idle/loading·taskdata없음에 기존 skeleton 표시, 캐시 refresh는 실제 내용 유지. error+scoredata는 수치와 오류를 함께 표시, null score의 ready는0 유지. CANCELLED 명시label+완료disabled,상세열기는가능. Home checkbox실제영역44이상도 F050의 Home 부분으로 처리하며 공통 toggle/close는 다음pair. RED UI→GREEN/type/nonfixlint, 기존form/rankingtest보존. Skeleton은 prototype state hook을 호출하지 않는 순수 LoadingState만 사용한다.

F010 exact `DSM_Back/src/tasks/tasks.service.ts` + `tasks.service.spec.ts`: query date가 가리키는 instant의 UTC day00:00~다음00:00 half-open으로 조회, date 생략 기존 all-history 의미는 F080의 bounded pagination 단계에서 보존한다. Offset/time-bearing입력·UTC day경계 회귀 RED→GREEN. 같은 파일의 다른 승인된 task invariant를 보존한다.

F044 exact `DSM_Back/src/categories/categories.service.ts` + `categories.service.spec.ts`: 소유권 확인 뒤 update/delete P2025는404로 매핑, 다른오류는원상·default403/foreign404/P2002 conflict409 보존. remove도try/catch 공통mapper 사용. 실제 disappearing row를 모의한 두경로RED→GREEN. F042 cap/pagination은 다음scope로 분리한다. 두개발자는 파일소유권이 겹치지 않는다.

Exact 단계1 `DSM_Front/src/features/product/product-store.ts` + `DSM_Front/src/features/product/product-store.test.ts`: 같은 scope의 network/timeout/HTTP5xx 실패는 기존 data와 오류를 함께 유지하며 최초 실패와 protocol/owner mismatch는 data를 게시하지 않는다. date/period 변경시 이전 scope는 보존하지 않는다. 오늘 추적 모드를 두고 foreground refresh 시 UTC 자정 변경을 반영한다. 명시적 과거 날짜 선택은 보존하고 today 선택은 추적을 재개한다. mutation 중 범위 변경·stale 응답 방어를 유지한다. CANCELLED toggle은 API 호출 없이 false. RED→GREEN, 전체 typecheck/정확 nonfix lint. 단계2 Home와 sheet의 표시·loading·취소 UI는 별도 exact pair를 문서화한 뒤 연결한다.

Backend 검증 작성자 exact writable 신규 `DSM_Back/test/auth-social-login.pg-spec.ts` 1파일. 실제 PostgreSQL에서 동시20개 동일 Kakao identity 최초 login의 User/SocialAccount 단일성·토큰 subject, 다른 provider 동일 email409와 자동 연결 금지, nickname 충돌 복구를 검증한다. 메인만 DB 실행. marker ALL55_DISPOSABLE_DB_TEST=1, URL ALL55_DATABASE_URL은 127.0.0.1:55348/all55_ prefix만 허용한다. 합성 provider mock 외 실제 AuthService/Prisma를 사용하며 fixture 소유 User만 정리한다.

A3 컨테이너 exact names dsm-all55-pg-20260911, dsm-all55-redis-20260911, dsm-all55-back-20260911, dsm-all55-fail-20260911. Redis는 로컬 공식 digest를 확인해 task 전용 network에서 실행한다. 운영 NODE_ENV에는 Redis URL이 필수이므로 실제 격리 Redis도 포함한다. 외부 포트는 PG55348/HTTP53018만 loopback으로 공개한다. Container build/run은 root, B2-PG 작성과 병렬 실행하되 root가 build 대상 source를 변경하지 않는다.
