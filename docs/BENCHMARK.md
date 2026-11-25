# 公開洩漏評測

2026-11-26 05:18（台北），20 份英文虛構文件包含 50 個已標註的敏感值。在同一批文件上，規則遮蔽 34 個，加入 Chrome 裝置端 Nano 後遮蔽 44 個。六份文件在 Nano 加規則模式仍各露出一個值。

| 模式 | 已遮蔽或由斷路器阻擋 | 仍在可送出內容中 | 攔下的請求 |
| --- | ---: | ---: | ---: |
| 只用規則 | 34 / 50 | 16 / 50 | — |
| 規則加 Layer 3 | 34 / 50 | 16 / 50 | 0 / 40 |
| Nano 加規則 | 44 / 50 | 6 / 50 | — |

每個標註按文件計一次。計分器逐份建出正式程式使用的 analysis 與 playbook 提示，對完整字串做大小寫不敏感的比對。只要其中一個可送出的提示仍含標註原值，就記為漏掉。第二欄模式會先以該文件的代號庫執行正式 Layer 3；本批資料沒有觸發阻斷，所以與規則單獨使用的結果一致。這項量測涵蓋文字中完整字串的露出；部分露出、語意可識別性、圖片、誤遮率與其他語言均需另行量測。

Nano 欄透過網頁呼叫正式 Stage 1 的 Firebase AI Logic 裝置端掃描器。20 列 Actual Source 全部為 ON_DEVICE，SDK 逐份記錄的耗時合計 33,511 ms。個別仍露出的文件是 lease、referral、follow-up、transfer、itinerary 和 memo。這批資料使用虛構姓名、保留的測試網域、文件用 IP 與虛構號碼，另在頁面限制外連。

## 重現

1. 在儲存庫執行 `npm ci` 與 `npm run bench`。Node 重跑規則與 Layer 3，再核對 Chrome 紀錄中的語料雜湊、文件 ID、ON_DEVICE 來源及計數範圍。
2. 在已設定本機 Firebase Web 環境、可用 Nano 的 Chrome，執行 `npm run dev` 後開啟本機的 `/bench/nano.html`，按「執行裝置端評測」。
3. 看到全部 20 份完成後，下載結果至 `bench/nano-result.json` 並重跑 `npm run bench`。任何一列回退到其他來源時，該次評測會中止。CI 使用儲存庫內註明日期的 Chrome 紀錄。

[20 份標註語料](../bench/corpus.mjs) · [計分實作](../bench/score.mjs) · [逐份 Chrome 紀錄](../bench/nano-result.json)
