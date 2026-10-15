# Hynix Market Radar

최신 버전은 AI 분석가, 캔들 차트, 마스터 AI와의 대화를 중심으로 한 시장 대시보드입니다.

- [현재 서비스](https://hynix-market-radar.kimsangho.chatgpt.site)
- [최신 전체 소스](./public-dashboard/)
- [상세 운영 문서](./public-dashboard/README.md)
- [조건부 매수 가격 산출 기준](./public-dashboard/docs/conditional-trade-plans.md)

## 최신 기능

- SK하이닉스, 나스닥, 비트코인, 코스피 선택 및 출처와 기준 시각을 표시한 시세.
- 캔들, 이동평균선 5/20/60/120, 볼린저 밴드, 거래량, 확대와 스크롤 줌.
- 도트 사무실에서 일하는 5명의 AI 분석가와 개별 보고서. 현재 모델은 모두 `gpt-6.1-sol`입니다.
- 버튼을 누를 때만 유료 AI 분석을 실행하며, 가격 갱신과 기록 조회는 AI를 호출하지 않습니다.
- 마스터의 매수/보류/매도 판단, 조건부 매수 검토 가격, 목표가, 무효화 가격, 손익비.
- 마스터와 후속 채팅, 브라우저에만 저장하는 가상 투자금 계산, 화면이 열린 동안의 가격 도달 알림.

가격 제시는 수익 보장이나 주문 실행이 아닙니다. 자료가 오래됐거나 부족하면 숫자 제안을 보류합니다.
국내 주식과 지수 데이터에는 지연이 있을 수 있으며, 비트코인 실시간 틱과 일봉 데이터의 출처는 구분합니다.
TrendForce 가격은 수집 및 공유 권한을 확인한 데이터 피드가 있을 때만 연결합니다.

## 로컬 실행

Node.js 22.13 이상에서 실행합니다.

```sh
cd public-dashboard
npm run install:ci
npm run dev -- --port 5176
```

환경 변수 이름은 `public-dashboard/.env.example`에 있습니다. 실제 키는 로컬 환경 또는 호스팅의 서버 전용 비밀 설정에만 입력해야 합니다.
AI 분석에는 BAZE 키와 서버 측 저장소 설정이 필요합니다. 현재 운영 서비스는 Sites와 Cloudflare Worker/D1을 사용합니다.
단순한 HTML 업로드나 GitHub Pages만으로 최신 서버 API와 AI 기능을 실행할 수는 없습니다.

```sh
node --import tsx --test tests/*.test.ts
npx tsc --noEmit --incremental false
npm run build
```

검증 명령은 `public-dashboard` 폴더에서 실행합니다. 실제 AI 연결 시험과 서비스에서의 분석/채팅은 크레딧을 사용할 수 있습니다.

## 보안과 공개 범위

- 이 저장소는 공개 소스입니다. `.env.local`, 실제 API 키, 개인 매매 자료, 대화 기록, 로컬 DB, 실행 로그와 빌드 산출물은 이번 업로드에서 제외했습니다.
- 서버 비밀 설정과 운영 DB는 GitHub에 복사하지 않습니다. `.env.example`에는 빈 값과 비밀이 아닌 예시 설정만 있습니다.
- 로그인 없는 링크 접근은 사용자 인증이 아닙니다. 링크를 받은 사람은 내용을 다시 공유하거나 유료 분석을 실행할 수 있습니다.
- 사용자의 요청대로 AI 일일 호출 상한은 없습니다. 공개 소스나 링크 공유가 AI 사용료를 없애 주지는 않습니다.
- 이번 업로드는 소스 백업이며, 기존 운영 서비스의 배포나 접근 설정을 변경하지 않습니다.

## 초기 정적 버전

아래 설명과 저장소 루트의 `index.html`, `api/`, `reports/`, `data/`, `scripts/`는 기존에 업로드되어 있던 초기 버전입니다.
기존 파일과 커밋 이력은 보존했으며, 최신 기능은 `public-dashboard/`에서 관리합니다.

### SK hynix Strategy Dashboard

SK하이닉스 추가 매수 전략을 점검하기 위한 정적 대시보드입니다.

## GitHub Pages

GitHub 저장소 설정에서 Pages를 다음처럼 켜면 됩니다.

```text
Settings -> Pages -> Build and deployment
Source: Deploy from a branch
Branch: main
Folder: / (root)
```

배포 후 주소는 보통 다음 형식입니다.

```text
https://awhatcatz.github.io/Sk-hynix/
```

## Files

```text
index.html
reports/sk_hynix_strategy_dashboard.html
data/pages-data.json
scripts/build_pages_snapshot.py
.github/workflows/update-pages-data.yml
```

## Data Refresh

GitHub Pages는 서버 API를 실행할 수 없기 때문에 `data/pages-data.json` 정적 스냅샷을 읽습니다.

`.github/workflows/update-pages-data.yml` 워크플로가 평일 장중에는 약 15분마다, 그 외 시간에는 6시간마다 데이터를 갱신하도록 구성되어 있습니다. GitHub Actions 지연이 있을 수 있으므로 완전 실시간 데이터가 필요하면 Vercel API 배포가 더 적합합니다.

## Risk Note

이 대시보드는 투자 판단 보조용입니다. 가격 알림과 전략 표시는 확정 수익을 보장하지 않으며, 실제 주문 전에는 현재가, 시장 상황, 주문 가능 수량을 별도로 확인해야 합니다.
