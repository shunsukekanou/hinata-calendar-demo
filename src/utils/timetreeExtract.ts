// TimeTree の「月」表示（Web 版）の画面から、予定を取り出す部品。
//
// ★この関数は、TimeTree のページの中で動かす「ブックマークレット」として使うため、
//   外の部品（import した関数・定数）を一切使わず、1つの関数の中で完結させること。
//   （関数の中身を文字にして、ブックマークに入れるため）
//
// 取り出し方：画面の文字を「位置つき」で読み、日付の数字が並ぶ升目（7列×週）に、予定を位置で当てはめる。
//   ・文字だけをコピーすると、予定がどの日のものか分からなくなるため
// 複数の月：「次の月」ボタンを押しながら、いまの月から months か月分を読む（読み終えたら元の月へ戻す）。
//   ・月の端（前後の月の日）に見える予定は、隣の月でも見えるので、重なるものは1つにまとめる
// 出力は「1行1予定」のタブ区切り：開始日 / 終了日 / 時刻（なければ空）/ 題名 / 色（#rrggbb）
export async function extractTimeTreeMonths(months: number): Promise<string> {
  const err = (m: string) => '#エラー\t' + m;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

  type Item = { start: string; end: string; time: string; title: string; color: string };
  const notes: string[] = [];

  // いま画面に出ている1か月分を読む。読めなければ null
  const readOne = (): { ym: string; items: Item[] } | null => {
    const header = document.querySelector('time')?.textContent ?? '';
    let year = 0;
    let month = 0;
    const ja = header.match(/(\d{4})\s*年\s*(\d{1,2})\s*月/);
    const en = header.match(/([A-Za-z]{3})[A-Za-z]*\.?,?\s*(\d{4})/);
    if (ja) {
      year = +ja[1];
      month = +ja[2];
    } else if (en) {
      year = +en[2];
      month = MONTHS.indexOf(en[1].toLowerCase()) + 1;
    }
    if (!year || month < 1) {
      notes.push(err('「月」の表示ではないようです。TimeTree の「Monthly（月）」にしてから、もう一度。（見出し：' + header + '）'));
      return null;
    }

    // 日付の数字（1〜31）の位置
    const nums: { n: number; cx: number; top: number }[] = [];
    document.querySelectorAll('div').forEach((e) => {
      if (e.children.length || !/^\d{1,2}$/.test(e.textContent?.trim() ?? '')) return;
      const r = e.getBoundingClientRect();
      if (r.width < 20 || r.width > 40 || r.height < 20 || r.height > 40 || r.top < 90) return;
      nums.push({ n: +e.textContent!.trim(), cx: r.left + r.width / 2, top: r.top });
    });
    nums.sort((a, b) => a.top - b.top || a.cx - b.cx);
    const rowTops: number[] = [];
    nums.forEach((x) => {
      if (!rowTops.length || x.top - rowTops[rowTops.length - 1] > 20) rowTops.push(x.top);
    });
    if (rowTops.length < 4 || nums.length !== rowTops.length * 7) {
      notes.push(err(year + '年' + month + '月の升目を読み取れませんでした（日付の数字：' + nums.length + '個）。'));
      return null;
    }
    const colCx = nums.slice(0, 7).map((x) => x.cx);
    const pitch = (colCx[6] - colCx[0]) / 6;
    const first = nums[0].n;
    // 左上の升目の日付（1日なら、その月の1日。それ以外は、前の月の日）
    const base = first === 1 ? new Date(year, month - 1, 1) : new Date(year, month - 2, first);
    const dateOf = (row: number, col: number) => ymd(new Date(base.getFullYear(), base.getMonth(), base.getDate() + row * 7 + col));
    const rowOf = (top: number) => {
      let r = 0;
      for (let i = 0; i < rowTops.length; i++) if (top >= rowTops[i] - 6) r = i;
      return r;
    };
    const colOf = (left: number) => {
      let c = 0;
      for (let i = 0; i < 7; i++) if (left >= colCx[i] - pitch / 2 - 4) c = i;
      return c;
    };
    const gridLeft = colCx[0] - pitch / 2;
    const gridRight = colCx[6] + pitch / 2;
    // 予定の色（ラベルの色）。棒の予定は、棒の色。点の予定（時刻つき）は、暗い背景の左の点の色
    const toHex = (c: string) => {
      const m = c.match(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/);
      return m ? '#' + [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('') : '';
    };
    const colorOf = (b: Element) => {
      const bg = getComputedStyle(b).backgroundColor;
      const m = bg.match(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/);
      if (m && +m[1] + +m[2] + +m[3] > 150) return toHex(bg);
      return toHex(getComputedStyle(b, '::before').backgroundColor);
    };
    const to24 = (t: string) => {
      const m = t.match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
      if (!m) return '';
      let h = +m[1];
      if (m[3]) {
        const pm = m[3].toUpperCase() === 'PM';
        if (pm && h < 12) h += 12;
        if (!pm && h === 12) h = 0;
      }
      return pad(h) + ':' + m[2];
    };

    type Seg = { row: number; c0: number; c1: number; title: string; time: string; color: string };
    const segs: Seg[] = [];
    document.querySelectorAll('button').forEach((b) => {
      const r = b.getBoundingClientRect();
      if (r.top < rowTops[0] || r.left < gridLeft - 4 || r.right > gridRight + 4 || r.height < 12 || r.height > 40) return;
      const spans = Array.prototype.slice.call(b.querySelectorAll('span')).filter((s) => s.children.length === 0 && s.textContent?.trim());
      if (!spans.length) return;
      const title = spans[0].textContent!.trim().replace(/\s+/g, ' ');
      const timeText = spans.length > 1 ? spans[spans.length - 1].textContent!.trim() : '';
      if (/^\+\s*\d+|^他\s*\d+|more$/i.test(title)) {
        notes.push('#注意\t' + year + '年' + month + '月に、省略されて見えない予定があります：「' + title + '」。TimeTree で、その日を開いて確かめてください');
        return;
      }
      const row = rowOf(r.top);
      const c0 = colOf(r.left + 2);
      const span = Math.max(1, Math.round((r.width + 16) / pitch));
      segs.push({ row, c0, c1: Math.min(6, c0 + span - 1), title, time: to24(timeText), color: colorOf(b) });
    });

    // 週をまたいで折れた長い予定（日曜で切れ、次の週の月曜から続く）を1つにつなぐ
    segs.sort((a, b) => a.row - b.row || a.c0 - b.c0);
    const used = new Set<Seg>();
    const items: Item[] = [];
    for (const s of segs) {
      if (used.has(s)) continue;
      used.add(s);
      let endRow = s.row;
      let endCol = s.c1;
      let cur = s;
      while (cur.c1 === 6) {
        const next = segs.find((t) => !used.has(t) && t.row === cur.row + 1 && t.c0 === 0 && t.title === s.title && t.time === s.time);
        if (!next) break;
        used.add(next);
        endRow = next.row;
        endCol = next.c1;
        cur = next;
      }
      items.push({ start: dateOf(s.row, s.c0), end: dateOf(endRow, endCol), time: s.time, title: s.title, color: s.color });
    }
    return { ym: year + '-' + pad(month), items };
  };

  // 「前の月」「次の月」ボタン：月の見出しの左にある2つのボタン（言語に左右されない見つけ方）
  const navButtons = () => {
    const t = document.querySelector('time');
    if (!t) return [];
    const tl = t.getBoundingClientRect().left;
    return Array.prototype.slice
      .call(document.querySelectorAll('button'))
      .filter((b: HTMLElement) => {
        const r = b.getBoundingClientRect();
        return r.top < 60 && r.width > 0 && r.left < tl;
      })
      .sort((a: HTMLElement, b: HTMLElement) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
      .slice(-2) as HTMLElement[];
  };
  const go = async (dir: 0 | 1) => {
    const btns = navButtons();
    const h = document.querySelector('time')?.textContent ?? '';
    if (btns.length < 2) return false;
    btns[dir].click();
    for (let k = 0; k < 25; k++) {
      await sleep(150);
      if ((document.querySelector('time')?.textContent ?? '') !== h) break;
    }
    await sleep(450); // 予定の表示が出そろうのを待つ
    return (document.querySelector('time')?.textContent ?? '') !== h;
  };

  const acc: Item[] = [];
  const firstYm: string[] = [];
  let moved = 0;
  const count = Math.max(1, Math.min(12, Math.floor(months) || 1));
  for (let i = 0; i < count; i++) {
    const got = readOne();
    if (!got) break;
    firstYm.push(got.ym);
    // 隣の月で、すでに読んだ予定と同じもの（日付が重なる）は、1つにまとめる
    const usedAcc = new Set<Item>();
    for (const it of got.items) {
      const hit = acc.find((a) => !usedAcc.has(a) && a.title === it.title && a.time === it.time && a.start <= it.end && it.start <= a.end);
      if (hit) {
        if (it.start < hit.start) hit.start = it.start;
        if (it.end > hit.end) hit.end = it.end;
        usedAcc.add(hit);
      } else {
        acc.push(it);
        usedAcc.add(it);
      }
    }
    if (i < count - 1) {
      if (!(await go(1))) {
        notes.push('#注意\t次の月へ進めませんでした。ここまでの分だけ読み取りました');
        break;
      }
      moved++;
    }
  }
  // 読み始めの月へ戻す
  for (let i = 0; i < moved; i++) await go(0);

  const lines = acc.map((a) => [a.start, a.end, a.time, a.title, a.color].join('\t')).sort();
  return ['#TimeTree-month-v1\t' + (firstYm[0] ?? '') + (firstYm.length > 1 ? '〜' + firstYm[firstYm.length - 1] : ''), ...notes, ...lines].join('\n');
}
