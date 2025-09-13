# 풍력 규제 레이어 뷰어 (VWorld + MapLibre)

AOI(관심영역) 폴리곤을 그려서 VWorld WFS로 규제/참조 레이어를 가져오고, 지도를 통해 On/Off하며 간단 분석을 돕는 웹 앱입니다.

## 주요 기능
- AOI 폴리곤 직접 그리기(Mapbox GL Draw)
- VWorld WFS API로 레이어 가져오기 및 AOI 기준 클리핑(Turf.js)
- 레이어 On/Off 토글 및 피처 개수 표시
- 로딩 오버레이, 에러 핸들링

지원 레이어(예시)
- 용도지역/지구: `lt_c_uq121`
- 개발제한구역: `lt_c_ud801`
- 경관지구: `lt_c_uq121`
- 행정경계(시군구): `lt_c_adsigg`
- 도로망/교통링크: `lt_l_moctlink`
- 급경사지역: `lt_c_up401`

필요 시 VWorld 데이터셋 식별자(typname)는 자유롭게 조정하세요.

## 폴더 구조
```
windreg-viewer/
├─ index.html
├─ README.md
├─ package.json (선택)
└─ src/
   ├─ app.js
   └─ styles.css
```

## 실행 방법
정적 사이트라 간단한 로컬 서버로 실행하면 됩니다. (브라우저 `file://`로 열면 일부 리소스/보안 이슈가 생길 수 있어 서버 권장)

### 방법 A) Node http-server
1) Node.js 설치 후 프로젝트 폴더에서:
```
npm install
npm run start
```
2) 브라우저에서 http://localhost:5173 접속

### 방법 B) Python 내장 서버
Node 설치가 부담스러우면 다음도 가능합니다:
```
python3 -m http.server 5173
```
이후 http://localhost:5173 접속

## 사용법
1) 우측 패널에 VWorld API Key를 입력합니다. (VWorld 콘솔에 `localhost` 도메인을 등록해야 403 오류를 피할 수 있습니다.)
2) 좌상단의 다각형 도구로 AOI 폴리곤을 그립니다.
3) 필요한 레이어를 체크 후 “AOI로 레이어 가져오기” 버튼을 누릅니다.
4) 각 레이어 우측 뱃지에 피처 개수가 표시됩니다. 체크박스로 On/Off 할 수 있습니다.
5) “AOI로 줌” 버튼으로 AOI 범위로 화면을 맞출 수 있습니다.
6) “결과 지우기”로 지도에 올린 결과 레이어를 제거합니다. (AOI는 Draw의 휴지통으로 지울 수 있습니다)

## 주의/팁
- VWorld WFS 호출량이 많거나 AOI가 큰 경우 응답이 느릴 수 있습니다. 필요 시 AOI를 작게 하거나 조회 범위를 나누세요.
- 일부 데이터는 폴리곤/라인 혼합일 수 있습니다. 본 앱은 폴리곤은 교차(intersect)하여 클리핑, 라인은 AOI와 교차 여부만 확인해 표시합니다.
- 필요에 따라 스타일(색상/두께/투명도)과 레이어 순서를 조정하세요.

## 라이선스
이 예제는 데모 용도로 제공됩니다. 데이터 사용 정책은 VWorld 및 해당 데이터 제공기관의 정책을 따릅니다.
