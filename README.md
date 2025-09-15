# 풍력 규제 레이어 뷰어 (VWorld + MapLibre)

AOI(관심영역) 폴리곤을 그려서 VWorld WFS로 풍력발전 관련 규제 레이어를 가져오고, 지도를 통해 시각화하는 웹 애플리케이션입니다.

## 주요 기능
- AOI 폴리곤 직접 그리기(Mapbox GL Draw)
- VWorld WFS API로 풍력발전 규제 레이어 가져오기 및 AOI 기준 클리핑(Turf.js)
- 색상별 레이어 구분 표시
- 레이어 On/Off 토글 및 피처 개수 표시
- 로딩 오버레이, 에러 핸들링

## 풍력발전 관련 규제 레이어
- 🔵 **용도지역/지구** (`lt_c_uq121`) - 도시계획 용도지역
- 🔴 **개발제한구역** (`lt_c_ud801`) - 그린벨트
- 🟠 **자연공원구역** (`lt_c_uf801`) - 국립/도립/군립공원
- 🟢 **산림보호구역** (`lt_c_uf211`) - 산림보호지역
- 🟣 **생태자연도 1등급** (`lt_c_em011`) - 생태보호지역
- 🔷 **하천/습지보호구역** (`lt_c_wkmstrm`) - 수자원보호구역
- 🔴 **문화재보호구역** (`lt_c_uh111`) - 문화재보호지역
- 🟤 **백두대간보호지역** (`lt_c_uq153`) - 백두대간 핵심/완충구역
- 🟡 **조류보호구역** (`lt_c_em012`) - 철새도래지 및 조류서식지

## 설정 방법

### 환경 변수 설정 (필수)

1. [VWorld](https://www.vworld.kr/dev/v4dv_2ddataguide2_s001.do)에서 API Key 발급
2. `.env.example` 파일을 `.env`로 복사
3. `.env` 파일에 API Key 설정:
   ```bash
   VWORLD_API_KEY=YOUR_VWORLD_API_KEY_HERE
   VWORLD_DOMAIN=wind.rkswork.com  # 또는 본인 도메인
   ```

## 폴더 구조
```
windreg-viewer/
├─ index.html
├─ README.md
├─ server.py          # 간단한 Python 서버 (환경변수에서 API key 읽기)
├─ .env.example       # 환경변수 예제
├─ .env               # 실제 환경변수 파일 (생성 필요)
├─ requirements.txt   # Python 패키지 (python-dotenv만 필요)
├─ package.json
└─ src/
   ├─ app.js
   └─ styles.css
```

## 실행 방법

### Python 서버 실행

1. Python 패키지 설치 (python-dotenv만 필요):
   ```bash
   pip install python-dotenv
   ```

2. 환경 변수 설정:
   ```bash
   cp .env.example .env
   # .env 파일을 열어 VWORLD_API_KEY 입력
   ```

3. 서버 실행:
   ```bash
   python server.py
   ```

4. 브라우저에서 http://localhost:5173 접속

서버가 환경 변수에서 API Key를 읽어 프론트엔드에 전달합니다.

## 사용법

1. **서버 실행**: 위의 실행 방법에 따라 Python 서버 시작
2. **AOI 폴리곤 그리기**: 지도 우측 상단의 다각형 도구로 관심 지역 선택
3. **레이어 가져오기**: 필요한 규제 레이어 체크 후 "AOI로 레이어 가져오기" 클릭
4. **레이어 관리**:
   - 각 레이어 옆 색상 표시로 구분
   - 체크박스로 레이어 On/Off
   - 우측 뱃지에 피처 개수 표시
5. **화면 제어**:
   - "AOI로 줌": AOI 범위로 화면 맞춤
   - "결과 지우기": 모든 결과 레이어 제거

## 주의사항
- VWorld 콘솔에 사용 도메인을 등록해야 403 오류를 피할 수 있습니다
- AOI가 클 경우 응답이 느릴 수 있으므로 적절한 크기로 설정하세요
- 일부 데이터는 폴리곤/라인이 혼합되어 있을 수 있습니다

## 라이선스
이 애플리케이션은 데모 용도로 제공됩니다. 데이터 사용 정책은 VWorld 및 해당 데이터 제공기관의 정책을 따릅니다.