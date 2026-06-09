# Scouter Widget — Stage 2 (Build B) 見た目オーバーホール 実装計画

- **作成**: 2026-06-09
- **前提**: Stage 1 (commit `2f06d63b`, versionCode 1464) が実機検証 PASS していること。**未検証のうちは着手しない**（視覚リスク高・ユーザー明示ゲート）。
- **大原則**: テーマ（緑モノクロ HUD）維持。「正しく機能している所を壊さない」。既存 view id / approval pills / choice pills / ASK / LOCAL / footer / conversation / resume を保持。変更は additive 中心。ネイティブ変更は回帰特化レビューエージェント → push。
- **対象端末**: minSdk 24（`app.config.ts:149`）。Chronometer の `setChronometerCountDown` (API24) も全対応端末で使用可。

---

## 現状把握（このセッションで精読済み）

### layout: `res/layout/scouter_widget_medium.xml`
縦 LinearLayout 一本。view id と役割:

| id | 種別 | 現在の色 | 役割 |
|----|------|---------|------|
| `scouter_codex_dot` | ImageView | colorForStatus | 状態ドット |
| `scouter_codex_title` | TextView 15sp bold | `#00FF41` | "CODEX" / "AGENT CODEX@PROJ" |
| `scouter_codex_badge` | TextView 11sp | `#00FF41` | **右寄せ状態シグナル**（`statusSignal` で `[OK]`/`[!!]`/`[>>>]` 等）。badge 名だが実体は signal |
| `scouter_codex_detail` | TextView 12sp | `#8CFFAA` | STATE 行 |
| `scouter_codex_doing` | TextView 11sp | `#66FF88` | DOING（tool/file or idle+last） |
| `scouter_codex_conversation` | TextView 14sp maxLines2 | `#00FF41` | 返信プレビュー（gone 既定） |
| `scouter_codex_metrics` | TextView 10sp | `#66FF88` | USAGE: `MODEL · TOK · $cost · %ctx` |
| `scouter_codex_usage` | TextView 9sp | `#5FBF7D` | rate/limit 行（gone 既定） |
| `scouter_codex_allow/deny/choice3` | TextView pills | — | approval/choice pills（gone 既定） |
| `scouter_codex_ask` | TextView pill | `#00FF41` | ASK pill |
| (divider) | TextView 1dp | `#3300FF41` | 区切り（**`<View>` は RemoteViews 不可なので TextView**） |
| `scouter_local_dot/title/badge/detail/metrics` | — | `#8CFFAA`/`#66FF88`/`#34E85E` | LOCAL LLM 行 |
| `scouter_footer` | TextView 10sp | `#34E85E` | `LOAD CPU.. · updated HH:MM:SS`（Stage1 で render 時刻に変更済み） |

### provider 配色・状態（`ScouterWidgetProvider.kt`）
- 色定数: `HUD_GREEN = rgb(0,255,65)`, `HUD_GREEN_STALE = rgb(52,232,94)` (line 1306-1307)。**amber/red は未定義**。
- `colorForStatus(status, stale)` (line 1199): 現状 stale→stale緑 / それ以外→緑 のみ。**status による分岐なし**。
- `statusSignal(status, stale)` (line 1007): idle `[..]` / thinking `[o..]`アニメ / tool `[>..]`アニメ / waiting `[??]` / error `[!!]` / completed `[OK]` / stale `[--]`。
- `bindRow` (line 448): row 共通バインド。dot 色は `colorForStatus`、title/detail/metrics はテキストのみ。色は外側 `applyCodexRowColors` 系（line 353-365 で HUD_GREEN 一律）。
- `bar(percent)` (line 1020): ASCII `[####......]`。`contextGaugeOnly` (line 1001) で使用。
- `cooldownSeconds(snapshot)` (line 1212): `rateLimitResetAt`/`retryAfterSeconds` から残秒。**Chronometer の base 計算に流用可**。
- rate 行: `structuredRateLimitLine`(5H/WK remaining%+RESET) / `statusWindowLimitLine` / `rateLimitLine`。
- LOCAL title prefix が `"MODEL  …"` (line 474) かつ codex metrics も `MODEL …` → **語衝突**（item 8）。

### RemoteViews 制約（Stage 2 設計の肝）
- **allowlist**: `Chronometer` / `ProgressBar` はどちらも `@RemoteView` 注釈付きで **使用可**（`<View>` は不可、TextView 代用してるのと対照的）。
- **Chronometer**: `setChronometer(id, base, format, started)` (API3) + `setChronometerCountDown(id, isCountDown)` (API24)。`base` は `SystemClock.elapsedRealtime()` タイムベース。**可視時は再描画なしで自走** → idle 凍結を一部解消 + 動く感。
- **ProgressBar tint が難所**: `setProgressBar(id, max, progress, indeterminate)` は色を設定しない。動的 tint は:
  - API31+: `RemoteViews.setColorStateList(id, "setProgressTintList", csl)` 可。
  - **API24–30: ColorStateList を RemoteViews 経由で渡せない** → 閾値色は「色違い ProgressBar を3つ用意して visibility 切替」しかない（view 数膨張・重い）。
- **Spannable は Parcel 越えで保持される**: `SpannableString`+`ForegroundColorSpan` を `setTextViewText` に渡せば**1行内の個別色分けが全 API で可能**。

---

## 設計判断（重要）

### 判断A: ゲージは ProgressBar ではなく **Spannable ASCII バー**を第一候補にする
理由: 閾値色（>25%緑 / ≤25%amber / ≤10%red）が要件だが、API24–30 で ProgressBar の動的 tint が事実上不可。色違い ProgressBar ×3×(5H/WK/ctx) は view 爆発。既存 `bar()` の ASCII ゲージを `SpannableString`+`ForegroundColorSpan` で色付けすれば、全 API で閾値色が出せ、HUD 美学とも一致し、layout 追加は TextView 1–2 個で済む。
- **代替**: フラット単色で良いなら本物 ProgressBar 1本（緑固定）も可。閾値色が要るなら Spannable ASCII を採用。
- → **既定: Spannable ASCII バー**。本物 ProgressBar は「動く塗り」が欲しい箇所（任意）にのみ単色で検討。

### 判断B: Chronometer は2用途に限定
1. **rate-limit reset カウントダウン**（`cooldownSeconds`/`rateLimitResetAt` がある時のみ可視）。
2. **セッション経過時間**（`sessionStartAt` から、active 時のみ）。
- base 計算: `elapsedRealtime() + (resetAtWallClock - currentTimeMillis())`（カウントダウン） / `elapsedRealtime() - (now - sessionStartAt)`（経過）。
- データが無い時は `visibility=gone` にして従来の静的テキストにフォールバック。

### 判断C: 既存テキスト行は維持しつつ色だけ Spannable 化（additive）
view id 追加は最小限（Chronometer 用に 1–2 個、ゲージ用 TextView 1 個程度）。既存 id・バインド経路は触らない。

---

## 実装項目

### 項目6: Chronometer（reset countdown + session elapsed）
**layout 追加**（`scouter_widget_medium.xml`）:
- `scouter_codex_reset_timer`: `<Chronometer>` 9–10sp 緑、`usage` 行近傍、`visibility=gone`。
- `scouter_codex_session_timer`: `<Chronometer>`（任意。DOING 行末 or footer 近傍）、`visibility=gone`。

**provider**:
- `bindCodexResetChronometer(views, snapshot, usageLimited)`:
  - reset 時刻ソース優先: `usageLimited.resetAt` → `snapshot.rateLimitPrimaryResetAt` → `rateLimitResetAt`。あれば
    `base = SystemClock.elapsedRealtime() + (resetAt - System.currentTimeMillis())`、
    `setChronometerCountDown(id, true)`, `setChronometer(id, base, "RESET %s", true)`, VISIBLE。無ければ GONE。
  - **注**: Stage1 の `recordWidgetUsageLimited(resetAt)` は現状常に null 呼び。Stage2 で `CodexScreenInspect.usageLimitSummary` から reset 時刻を parse して渡すか、structured snapshot 由来を使う（後者が確実）。
- `bindCodexSessionChronometer(views, snapshot)`: active(非 stale & 非 idle) 時のみ `base = elapsedRealtime() - (now - sessionStartAt)`, countDown=false, VISIBLE。

**効果**: 再描画なしで秒進行 → 「動く」+ idle 凍結緩和。

### 項目7: ゲージ（5H / WK 残量 + ctx）— Spannable ASCII（判断A）
**provider**:
- `gaugeSpan(label: String, remainingPercent: Double): CharSequence`:
  - `bar(100 - remaining)` 流用 or 残量版バー。`SpannableString` 化し、塗り部分に閾値色:
    `>25% → HUD_GREEN` / `≤25% → HUD_AMBER` / `≤10% → HUD_RED`。
  - 例: `5H [####······] 45% left`（"45% left" と "####" を残量色、レール "······" を dim）。
- `codexUsageLine` / 新 `scouter_codex_gauge` TextView に `5H`・`WK`・`CTX` を Spannable 連結で出力。
- ctx は `contextPercentRemaining` がある時のみ（hook が出す時のみ。無ければ省略 ← Stage1 方針踏襲）。

**layout 追加**: `scouter_codex_gauge` TextView（9–10sp monospace, `visibility=gone`）。または既存 `scouter_codex_usage` を Spannable 化して流用（view 追加ゼロ・推奨）。

### 項目8: 状態色分け + 情報整理（Spannable + setTextColor）
**色定数追加**（provider companion）:
```
HUD_AMBER = Color.rgb(255, 176, 0)   // ≤25% / waiting
HUD_RED   = Color.rgb(255, 64, 64)   // ≤10% / error / rate-limit
HUD_DIM   = Color.rgb(95, 191, 125)  // 二次情報（既存 #5FBF7D 相当）
HUD_BRIGHT= Color.rgb(120,255,140)   // thinking/tool（明緑）
```
**`colorForStatus` を status 分岐に拡張**:
- idle → HUD_GREEN / thinking・tool → HUD_BRIGHT / waiting → HUD_AMBER / error → HUD_RED / completed → HUD_GREEN / stale → HUD_GREEN_STALE。
- dot + title + signal に適用（既存 line 353-365 の一律 HUD_GREEN を status 連動へ）。**rate-limit override 時は amber/red を STATE/signal に反映**。

**used/left 明示**（ユーザー指摘の混同防止）:
- metrics 行: `TOK 49.4K` → `49.4K used`（or `TOK 49.4K used`）。
- rate 行: `5H 45% left`（既存 `left` tag 済み）。両者で used/left を明示し取り違え防止。

**dim 階層**: metrics/footer/usage を `HUD_DIM`、一次情報（title/conversation/signal）を明色。Spannable で1行内も used=明/レール=dim。

**Local offline 1行圧縮**: LOCAL が offline の時 detail+metrics を1行に圧縮（`LOCAL offline · probe 8080/11434`）。

**[OK] 重複解消**: `statusSignal` の `[OK]`（badge slot, 右上）と conversation/detail の完了表現が二重。→ **完了は右上 signal のみ**にし、detail 側の重複文言を抑制（どちらか一方）。

**下段ヘッダ `MODEL`→`LOCAL`**（語衝突解消）:
- `bindRow` LOCAL_LLM title prefix `"MODEL  …"` → `"LOCAL  …"` (line 474)。
- render empty title `"MODEL: LOCAL LLM"` → `"LOCAL  LLM"` (line 296)。
- codex metrics の `MODEL …` は据え置き（agent 行なので衝突解消される）。

**追加候補（任意・余力で）**: git branch（`snapshot.gitBranch`）、error 詳細（`lastError`）、相対 last-active（`idle 3m`）。

### 項目9: 会話行を YOU + Codex の2行に（2026-06-09 ユーザー決定）
**Why**: idle/完了時に会話行が「YOU <自分のプロンプト>」だけになり（その turn の Codex 返信が捕捉できないと特に）、何が起きたか分からない。
**実装**: `widgetConversationPreview`（`ScouterWidgetProvider.kt:785`）の idle/完了フォールバックを、`scouter_codex_conversation`（maxLines=2）に **2行**で出す:
- line1 `YOU  <prompt>`、line2 `CODEX <answer>`（`\n` 連結、各 shorten）。
- 返信が取れない場合は line2 を dim で `CODEX —`（or `返信なし`）にし、プロンプトだけのフォールバックは廃止。
- **承認/選択など blocking 状態は従来どおり優先**（APPROVAL/CHOICE 行が上書き）。この2行化は idle/完了パスのみ。

### 項目10: 通知本文に質問/選択肢をフル表示（2026-06-09 ユーザー決定）
**Why**: 承認・選択の通知が短く/汎用文になりがちで、何を承認/選択するか分かりづらい。
**実装**: `NotificationDispatcher.kt`
- **承認** (`notifyApprovalNeeded`): 本文に「何を承認するか」（command/diff = `approvalText`）を `BigTextStyle` でフル表示。`REPLY_MAX_CHARS=120` を承認用に引き上げ検討。Allow/Deny ボタンは現状維持。
- **選択** (`notifyChoiceWaiting`): 本文に **メニュー本文 + 各選択肢ラベルを列挙**（`1. xxx / 2. yyy / 3. zzz`）を `BigTextStyle` で表示（ボタンが出ないランチャー/通知面でも内容が読める）。1/2/3 ボタンは現状維持。
- **注**: ユーザーは「PTS 検出のみの承認も通知（ギャップA）」は**今回は選択せず**。live poll の APPROVAL 分岐 no-op は据え置き（将来 P2）。

> Q&A (2026-06-09): 会話行=「YOU + Codex 両方2行」 / 通知=「本文に質問/選択肢フル表示」。ギャップA（PTS-only 承認通知）は今回スコープ外。

---

## 触るファイル
- `res/layout/scouter_widget_medium.xml` — Chronometer ×1–2 追加、ゲージ TextView（既存 usage 流用なら追加ゼロ）。
- `ScouterWidgetProvider.kt` — 色定数追加、`colorForStatus` 拡張、`bindCodexResetChronometer`/`bindCodexSessionChronometer`、`gaugeSpan`、metrics/usage の Spannable 化、LOCAL prefix、[OK] 重複解消。
- （必要なら）`CodexScreenInspect.kt` — reset 時刻 parse（structured 由来で足りれば不要）。
- `res/values/scouter_strings.xml` — 新規文言があれば。

## リスク / 注意
- **Chronometer base のタイムベース誤り**は時計が飛ぶ典型バグ。`elapsedRealtime()` 基準を厳守、wall-clock と混同しない。
- **Spannable が host で落ちないか**: ForegroundColorSpan は Parcelable で実績あり。ただし host(ランチャー)依存の描画差は実機確認必須。
- **view 追加で RemoteViews InflateException**: Chronometer/ProgressBar は allowlist 内だが、追加後は必ず実機の複数ランチャーで inflate 確認。
- **`updatePeriodMillis=0` 据え置き**: Chronometer 自走 + Stage1 heartbeat(60s) の二段で鮮度維持。Chronometer は可視時のみ自走なので heartbeat は残す。
- 文字量増で1行 ellipsize 過多 → サイズ/省略の実機調整。

## 実装順（推奨）
1. 色定数 + `colorForStatus` 拡張 + LOCAL prefix + used/left 明示（テキスト/色のみ・低リスク）。
2. metrics/usage の Spannable 化 + ゲージ閾値色（判断A）。
3. Chronometer（layout 追加 + バインド）。最も視覚/inflate リスク高 → 最後。
4. 回帰特化レビューエージェント → push（1ビルド）→ in-app update → 実機検証。

## 検証チェックリスト（実機）
- [ ] 全状態で色が正しい（idle緑 / thinking明 / waiting amber / error red / rate-limit amber/red / stale）。
- [ ] ゲージ閾値色（>25/≤25/≤10）が境界で切替。
- [ ] reset Chronometer が正しい残時間からカウントダウン、解除で gone。
- [ ] session Chronometer が経過時間を進める、idle/stale で gone。
- [ ] used / left の表記が取り違えなく読める。
- [ ] [OK] が1箇所のみ。LOCAL ヘッダが `LOCAL`。
- [ ] **回帰なし**: approval/choice pills・ASK・conversation・resume・footer・Local 行が従来通り。
- [ ] 複数ランチャーで InflateException なし。
