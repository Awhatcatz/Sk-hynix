# SK hynix Strategy Dashboard

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
