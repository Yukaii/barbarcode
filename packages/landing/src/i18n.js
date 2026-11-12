// Landing page copy. Values may contain HTML; keys used inside attributes must be plain text.
// Every locale must define every key: the renderer fails the build on a missing one.

const FONTS_LATIN =
  "family=Atkinson+Hyperlegible+Next:wght@400;600&family=Big+Shoulders+Display:wght@700;900&family=Martian+Mono:wght@400;500";

export const locales = [
  {
    code: "en",
    htmlLang: "en",
    path: "/",
    label: "English",
    ogLocale: "en_US",
    fonts: `https://fonts.googleapis.com/css2?${FONTS_LATIN}&display=swap`,
    demo: {
      items: [
        { name: "Graphite pencil, HB", currency: "$", price: "1.20", code: "400638133393" },
        { name: "Dotted notebook, A5", currency: "$", price: "6.50", code: "590123412345" },
        { name: "Design Patterns (book)", currency: "$", price: "54.99", code: "978020163361" },
      ],
      copied: "Copied",
      copyFailed: "Select and copy",
    },
    t: {
      title: "Barbarcode: use your phone as a barcode scanner",
      description:
        "Scan barcodes with your phone's camera and have them typed into your computer, like a USB scanner. Add Tab, Enter or any shortcut after each scan. Free and open source.",
      ogDescription:
        "Scan with your phone. It types into your computer. Run npx barbarcode to start.",
      langNavLabel: "Language",
      projectNavLabel: "Project links",
      heroLine1: "Scan with your phone.",
      heroLine2: "Type on your computer.",
      lede: "Point your phone's camera at a barcode and it's typed into whatever is open on your computer, just like a USB scanner. Add Tab, Enter or any shortcut after each scan.",
      copy: "Copy",
      fineprint: "Needs Node.js 22 or newer. No app on the phone, no account.",
      stageLabel: "Animated example: a barcode is scanned and typed into a spreadsheet",
      sheetTitle: "Stock count",
      sheetSku: "SKU",
      sheetQty: "Qty",
      keystripLabel: "Each scan types",
      stepsTitle: "How it works",
      step1Title: "Run it on your computer",
      step1Body: "Run <code>npx barbarcode</code> in a terminal. A QR code appears.",
      step2Title: "Scan the QR code with your phone",
      step2Body: "The scanner opens in your phone's browser. No app to install.",
      step3Title: "Point it at barcodes",
      step3Body:
        "Each code is typed wherever your cursor is: a spreadsheet, a form, a point-of-sale screen.",
      profilesTitle: "Choose what happens after each scan",
      profilesIntro:
        "Save keystroke profiles in <code>barbarcode.toml</code> (run <code>npx barbarcode init</code> for an example), then start with <code>npx barbarcode -s price_check</code>. You can switch profiles from the phone while you scan.",
      colProfile: "Profile",
      colPattern: "Pattern",
      colTypes: "Types",
      wait150: "wait 150 ms",
      profilesNote:
        "Also: <code>{tab}</code>, <code>{esc}</code>, arrow keys, <code>{f1}</code> to <code>{f24}</code>, and any shortcut like <code>{ctrl+s}</code>. The barcode itself is always typed as plain text, so a barcode can never trigger a shortcut.",
      connectTitle: "Works on any network",
      connectIntro:
        "Phone browsers only allow the camera on secure (HTTPS) pages, so barbarcode gives your phone a secure address to reach your computer. The default works anywhere; the others keep everything on infrastructure you choose.",
      colCommand: "Command",
      colConnects: "How it connects",
      colNeed: "You'll need",
      relayHow: "Through the barbarcode relay, from any network",
      relayNeed: "Nothing",
      cloudflareHow: "A temporary Cloudflare tunnel that you run",
      cloudflareNeed: "<code>cloudflared</code>, no account",
      tailscaleHow: "Your tailnet, so only your own devices can connect",
      tailscaleNeed: "Tailscale with HTTPS turned on",
      connectNote:
        "Scans are end-to-end encrypted. The key exists only in the QR code, so neither the relay nor a tunnel can read your scans or type on your computer.",
      platformsTitle: "Types on macOS, Windows and Linux",
      macos:
        "Allow your terminal app once in System Settings, under Privacy &amp; Security, Accessibility.",
      windows: "Works out of the box.",
      linux: "Install <code>xdotool</code> (X11) or <code>wtype</code> (Wayland).",
      footer:
        'Barbarcode is free and open source under the MIT license. Read the code on <a href="https://github.com/Yukaii/barbarcode">GitHub</a>.',
    },
  },
  {
    code: "zh-tw",
    htmlLang: "zh-TW",
    path: "/zh-tw/",
    label: "繁體中文",
    ogLocale: "zh_TW",
    fonts: `https://fonts.googleapis.com/css2?${FONTS_LATIN}&family=Noto+Sans+TC:wght@400;600;900&display=swap`,
    demo: {
      items: [
        { name: "HB 鉛筆", currency: "NT$", price: "15", code: "400638133393" },
        { name: "A5 點陣筆記本", currency: "NT$", price: "180", code: "590123412345" },
        { name: "《設計模式》", currency: "NT$", price: "1,580", code: "978020163361" },
      ],
      copied: "已複製",
      copyFailed: "請手動選取複製",
    },
    t: {
      title: "Barbarcode：把手機變成條碼掃描器",
      description:
        "用手機相機掃描條碼，內容會自動輸入到電腦，就像 USB 條碼掃描器。每次掃描後還能自動按 Tab、Enter 或任何快速鍵。免費開源。",
      ogDescription: "用手機掃條碼，自動輸入到電腦。執行 npx barbarcode 就能開始。",
      langNavLabel: "語言",
      projectNavLabel: "專案連結",
      heroLine1: "用手機掃條碼，",
      heroLine2: "自動輸入到電腦。",
      lede: "把手機相機對準條碼，內容就會輸入到電腦上目前開著的視窗，就像 USB 條碼掃描器一樣。每次掃描後還能自動按 Tab、Enter 或任何快速鍵。",
      copy: "複製",
      fineprint: "電腦需要 Node.js 22 以上版本。手機不用裝 App，也不用註冊帳號。",
      stageLabel: "動畫示範：掃描條碼後，內容自動輸入到試算表",
      sheetTitle: "盤點表",
      sheetSku: "商品編號",
      sheetQty: "數量",
      keystripLabel: "每次掃描輸入",
      stepsTitle: "使用方式",
      step1Title: "在電腦上執行",
      step1Body: "在終端機執行 <code>npx barbarcode</code>，畫面上會出現 QR Code。",
      step2Title: "用手機掃描 QR Code",
      step2Body: "掃描器會在手機瀏覽器中開啟，不需要安裝 App。",
      step3Title: "對準條碼",
      step3Body: "每個條碼都會輸入到游標所在的位置：試算表、表單、POS 收銀畫面都可以。",
      profilesTitle: "自訂每次掃描後的按鍵",
      profilesIntro:
        "把按鍵設定檔存在 <code>barbarcode.toml</code>（執行 <code>npx barbarcode init</code> 可以產生範例），再用 <code>npx barbarcode -s price_check</code> 啟動。掃描時也能直接在手機上切換設定檔。",
      colProfile: "設定檔",
      colPattern: "格式",
      colTypes: "實際輸入",
      wait150: "等待 150 毫秒",
      profilesNote:
        "另外也支援 <code>{tab}</code>、<code>{esc}</code>、方向鍵、<code>{f1}</code> 到 <code>{f24}</code>，以及 <code>{ctrl+s}</code> 這類快速鍵。條碼內容一律以純文字輸入，所以條碼本身絕對不會觸發快速鍵。",
      connectTitle: "任何網路都能用",
      connectIntro:
        "手機瀏覽器只允許在安全（HTTPS）的網頁使用相機，所以 barbarcode 會提供一個安全網址，讓手機連到你的電腦。預設方式在任何網路都能用；其他方式則讓連線只經過你自己選擇的服務。",
      colCommand: "指令",
      colConnects: "連線方式",
      colNeed: "需要準備",
      relayHow: "透過 barbarcode 中繼伺服器，任何網路都能連",
      relayNeed: "不需要",
      cloudflareHow: "由你自己執行的臨時 Cloudflare 通道",
      cloudflareNeed: "<code>cloudflared</code>，不需要帳號",
      tailscaleHow: "透過你的 tailnet，只有你自己的裝置能連線",
      tailscaleNeed: "已開啟 HTTPS 的 Tailscale",
      connectNote:
        "掃描內容全程端對端加密。金鑰只存在 QR Code 裡，所以中繼伺服器和通道都無法讀取你的掃描內容，也無法在你的電腦上輸入任何東西。",
      platformsTitle: "支援 macOS、Windows 和 Linux",
      macos: "第一次使用時，到「系統設定」的「隱私權與安全性」&gt;「輔助使用」允許你的終端機 App。",
      windows: "不需要額外設定。",
      linux: "請安裝 <code>xdotool</code>（X11）或 <code>wtype</code>（Wayland）。",
      footer:
        'Barbarcode 是採用 MIT 授權的免費開源軟體，原始碼公開在 <a href="https://github.com/Yukaii/barbarcode">GitHub</a>。',
    },
  },
  {
    code: "ja",
    htmlLang: "ja",
    path: "/ja/",
    label: "日本語",
    ogLocale: "ja_JP",
    fonts: `https://fonts.googleapis.com/css2?${FONTS_LATIN}&family=Noto+Sans+JP:wght@400;600;900&display=swap`,
    demo: {
      items: [
        { name: "鉛筆 HB", currency: "¥", price: "110", code: "400638133393" },
        { name: "ドット方眼ノート A5", currency: "¥", price: "880", code: "590123412345" },
        { name: "デザインパターン（書籍）", currency: "¥", price: "5,830", code: "978020163361" },
      ],
      copied: "コピーしました",
      copyFailed: "選択してコピーしてください",
    },
    t: {
      title: "Barbarcode：スマホをバーコードリーダーに",
      description:
        "スマホのカメラでバーコードを読み取り、パソコンに自動入力。USB バーコードリーダーと同じように使えます。スキャンのたびに Tab や Enter、好きなショートカットも送れます。無料のオープンソースです。",
      ogDescription:
        "スマホでスキャンして、パソコンに自動入力。npx barbarcode ですぐに始められます。",
      langNavLabel: "言語",
      projectNavLabel: "プロジェクトのリンク",
      heroLine1: "スマホでスキャン。",
      heroLine2: "パソコンに自動入力。",
      lede: "スマホのカメラをバーコードに向けるだけで、パソコンで開いているアプリにそのまま入力されます。USB バーコードリーダーと同じ感覚です。スキャンのたびに Tab や Enter、好きなショートカットも送れます。",
      copy: "コピー",
      fineprint:
        "パソコンに Node.js 22 以上が必要です。スマホにアプリは不要、アカウント登録もいりません。",
      stageLabel: "アニメーション例：バーコードを読み取り、スプレッドシートに入力する様子",
      sheetTitle: "棚卸し表",
      sheetSku: "商品コード",
      sheetQty: "数量",
      keystripLabel: "スキャンごとに入力",
      stepsTitle: "使い方",
      step1Title: "パソコンで起動する",
      step1Body: "ターミナルで <code>npx barbarcode</code> を実行すると、QR コードが表示されます。",
      step2Title: "スマホで QR コードを読み取る",
      step2Body: "スマホのブラウザでスキャナーが開きます。アプリのインストールは不要です。",
      step3Title: "バーコードに向ける",
      step3Body:
        "読み取ったコードはカーソルの位置に入力されます。スプレッドシート、フォーム、POS レジ画面など、どこでも使えます。",
      profilesTitle: "スキャン後のキー操作を自由に設定",
      profilesIntro:
        "キー操作のプロファイルを <code>barbarcode.toml</code> に保存し（<code>npx barbarcode init</code> でサンプルを作成できます）、<code>npx barbarcode -s price_check</code> で起動します。スキャン中にスマホからプロファイルを切り替えることもできます。",
      colProfile: "プロファイル",
      colPattern: "パターン",
      colTypes: "入力内容",
      wait150: "150 ミリ秒待つ",
      profilesNote:
        "ほかにも <code>{tab}</code>、<code>{esc}</code>、矢印キー、<code>{f1}</code>〜<code>{f24}</code>、<code>{ctrl+s}</code> のようなショートカットに対応しています。バーコードの内容は常にテキストとして入力されるので、バーコードがショートカットを実行することはありません。",
      connectTitle: "どんなネットワークでも使える",
      connectIntro:
        "スマホのブラウザは安全な（HTTPS）ページでしかカメラを使えません。そこで barbarcode は、スマホからパソコンにつながる安全なアドレスを用意します。標準の方法はどこでも使え、ほかの方法では通信経路を自分で選べます。",
      colCommand: "コマンド",
      colConnects: "接続方法",
      colNeed: "必要なもの",
      relayHow: "barbarcode の中継サーバー経由。どのネットワークからでも接続できます",
      relayNeed: "なし",
      cloudflareHow: "自分で起動する一時的な Cloudflare トンネル",
      cloudflareNeed: "<code>cloudflared</code>（アカウント不要）",
      tailscaleHow: "自分の tailnet 経由。自分の端末だけが接続できます",
      tailscaleNeed: "HTTPS を有効にした Tailscale",
      connectNote:
        "スキャン内容はエンドツーエンドで暗号化されます。鍵は QR コードの中にしかないため、中継サーバーやトンネルがスキャン内容を読んだり、パソコンに入力したりすることはできません。",
      platformsTitle: "macOS、Windows、Linux に対応",
      macos:
        "初回のみ、「システム設定」の「プライバシーとセキュリティ」&gt;「アクセシビリティ」でターミナルアプリを許可してください。",
      windows: "追加の設定は不要です。",
      linux:
        "<code>xdotool</code>（X11）または <code>wtype</code>（Wayland）をインストールしてください。",
      footer:
        'Barbarcode は MIT ライセンスの無料オープンソースソフトウェアです。ソースコードは <a href="https://github.com/Yukaii/barbarcode">GitHub</a> で公開しています。',
    },
  },
];
