import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import {
  CalendarDays, CheckCircle2, Download, FileJson, Pencil, Plus, RotateCcw,
  Save, Target, Trash2, TrendingDown, TrendingUp, Upload, Wallet, X,
} from "lucide-react";
import {
  calculateMonth, createBackupPayload, currentMonthKey, emptyMonth, formatRupiah,
  formatSignedRupiah, isMonthKey, monthLabel, parseTradingPlanBackup, readTradingPlanState,
  recordId, TRADING_PLAN_STORAGE_KEY, type MonthPlan, type RecordType, type StorageStatus,
  type TradingPlanState, type TradingRecord,
} from "./storage";

type RecordDraft = { id: string | null; date: string; type: RecordType; amount: string; note: string };

function todayForMonth(monthKey: string): string {
  const now = new Date();
  const today = currentMonthKey(now) === monthKey
    ? String(now.getDate()).padStart(2, "0")
    : "01";
  return monthKey + "-" + today;
}

function monthEnd(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return monthKey + "-" + String(new Date(year, month, 0).getDate()).padStart(2, "0");
}

function cardStyle(extra = "") {
  return "rounded-2xl border border-[#202c3b] bg-[#0c121c] " + extra;
}

function rupiahInput(value: number) {
  return value > 0 ? String(value) : "";
}

function StatusBadge({children, tone = "neutral"}: {children: ReactNode; tone?: "green" | "red" | "neutral"}) {
  const colors = tone === "green"
    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
    : tone === "red"
      ? "border-rose-400/20 bg-rose-400/10 text-rose-300"
      : "border-[#2a384a] bg-[#121c29] text-[#9ba9bc]";
  return <span className={"inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.12em] " + colors}>{children}</span>;
}

function SectionTitle({title,subtitle,action}:{title:string;subtitle?:string;action?:ReactNode}) {
  return <div className="mb-4 flex items-end justify-between gap-3"><div><h2 className="text-sm font-semibold text-slate-100">{title}</h2>{subtitle?<p className="mt-1 text-[11px] leading-5 text-[#8190a5]">{subtitle}</p>:null}</div>{action}</div>;
}

function MetricCard({label,value,icon:Icon,tone="neutral",hint}:{label:string;value:string;icon:typeof Wallet;tone?:string;hint?:string}) {
  const color = tone === "green" ? "text-emerald-300" : tone === "red" ? "text-rose-300" : "text-sky-300";
  return <div className={cardStyle("p-4 sm:p-5")}><div className="flex items-center justify-between gap-2"><div className="text-[10px] font-medium uppercase tracking-[.14em] text-[#8190a5]">{label}</div><Icon className={"size-4 " + color}/></div><div className={"mt-3 break-words text-xl font-semibold tracking-tight sm:text-2xl " + color}>{value}</div>{hint?<div className="mt-1 text-[10px] text-[#8190a5]">{hint}</div>:null}</div>;
}

export default function TradingPlanPage() {
  const [initial] = useState(() => readTradingPlanState());
  const [data, setData] = useState<TradingPlanState>(initial.state);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>(initial.status);
  const [targetDraft, setTargetDraft] = useState(() => rupiahInput(initial.state.months[initial.state.selectedMonth]?.target ?? 0));
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<RecordDraft>({id:null,date:todayForMonth(initial.state.selectedMonth),type:"profit",amount:"",note:""});
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedMonth = data.selectedMonth;
  const monthData: MonthPlan = data.months[selectedMonth] ?? emptyMonth();
  const stats = useMemo(() => calculateMonth(monthData), [monthData]);
  const visibleRecords = useMemo(
    () => [...monthData.records].sort((a,b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [monthData.records],
  );

  useEffect(() => {
    setTargetDraft(rupiahInput(data.months[data.selectedMonth]?.target ?? 0));
  }, [data.selectedMonth, monthData.target]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const commit = (next: TradingPlanState, toast?: string) => {
    let nextStatus: StorageStatus = "unavailable";
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(TRADING_PLAN_STORAGE_KEY, JSON.stringify(next));
        nextStatus = "available";
      }
    } catch {
      nextStatus = "unavailable";
    }
    setData(next);
    setStorageStatus(nextStatus);
    if (toast) setNotice(toast);
  };

  const selectMonth = (month: string) => {
    if (!isMonthKey(month)) return;
    if (month === selectedMonth) return;
    setFormOpen(false);
    setEditing(false);
    setFormError("");
    commit({...data, selectedMonth:month});
  };

  const changeTargetDraft = (rawValue: string) => {
    setTargetDraft(rawValue);
    setFormError("");
    const value = rawValue.trim() === "" ? 0 : Number(rawValue);
    if (!Number.isFinite(value) || value < 0) return;
    const nextMonth = {...monthData, target:value};
    commit({...data, months:{...data.months, [selectedMonth]:nextMonth}});
  };

  const saveTarget = () => {
    const value = targetDraft.trim() === "" ? 0 : Number(targetDraft);
    if (!Number.isFinite(value) || value < 0) {
      setImportMessage("");
      setFormError("Target harus berupa angka nol atau lebih.");
      return;
    }
    const nextMonth = {...monthData, target:value};
    commit({...data, months:{...data.months, [selectedMonth]:nextMonth}}, "Target tersimpan");
    setFormError("");
  };

  const openAddForm = () => {
    setDraft({id:null,date:todayForMonth(selectedMonth),type:"profit",amount:"",note:""});
    setFormError("");
    setEditing(false);
    setFormOpen(true);
  };

  const openEditForm = (record: TradingRecord) => {
    setDraft({id:record.id,date:record.date,type:record.type,amount:String(record.amount),note:record.note});
    setFormError("");
    setEditing(true);
    setFormOpen(true);
  };

  const saveRecord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(draft.amount);
    if (!draft.date || !draft.date.startsWith(selectedMonth + "-")) {
      setFormError("Tanggal record harus berada di bulan yang sedang dipilih.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Nominal harus lebih besar dari Rp 0.");
      return;
    }
    const record: TradingRecord = {
      id:draft.id ?? recordId(),
      date:draft.date,
      type:draft.type,
      amount:Math.round(amount),
      note:draft.note.trim(),
    };
    const records = draft.id
      ? monthData.records.map((item) => item.id === draft.id ? record : item)
      : [...monthData.records, record];
    commit({...data, months:{...data.months, [selectedMonth]:{...monthData, records}}}, editing ? "Record diperbarui" : "Data tersimpan");
    setFormOpen(false);
    setEditing(false);
    setFormError("");
  };

  const deleteRecord = (record: TradingRecord) => {
    const confirmed = typeof window !== "undefined" && window.confirm("Apakah Anda yakin ingin menghapus record ini?");
    if (!confirmed) return;
    const records = monthData.records.filter(item => item.id !== record.id);
    commit({...data, months:{...data.months, [selectedMonth]:{...monthData, records}}}, "Record dihapus");
    if (draft.id === record.id) setFormOpen(false);
  };

  const saveReview = (review: string) => {
    commit({...data, months:{...data.months, [selectedMonth]:{...monthData, review}}});
  };

  const resetMonth = () => {
    const confirmed = typeof window !== "undefined" && window.confirm("Reset data bulan ini? Target, record, dan catatan evaluasi bulan yang dipilih akan dihapus. Bulan lain tetap aman.");
    if (!confirmed) return;
    const months = {...data.months};
    delete months[selectedMonth];
    commit({...data, months}, "Data bulan ini direset");
    setFormOpen(false);
    setEditing(false);
    setFormError("");
  };

  const exportBackup = () => {
    try {
      const blob = new Blob([createBackupPayload(data)], {type:"application/json;charset=utf-8"});
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "xau-news-ai-trading-plan-" + selectedMonth + "-backup.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setImportMessage("Backup berhasil dibuat.");
    } catch {
      setImportMessage("Export gagal di browser ini.");
    }
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const validated = parseTradingPlanBackup(text);
      const confirmation = window.confirm("Import akan mengganti data Trading Plan yang tersimpan sekarang dengan data dalam backup. Lanjutkan?");
      if (!confirmation) {
        setImportMessage("Import dibatalkan. Data lama tetap aman.");
        return;
      }
      commit(validated, "Backup berhasil diimpor");
      setFormOpen(false);
      setEditing(false);
      setFormError("");
      setImportMessage("Backup valid dan berhasil dipulihkan.");
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "File backup tidak valid. Data lama tetap aman.");
    }
  };

  const monthlyHistory = useMemo(() => Object.entries(data.months)
    .filter(([month, plan]) => isMonthKey(month) && (plan.target > 0 || plan.records.length > 0 || plan.review.trim().length > 0))
    .sort(([a],[b]) => b.localeCompare(a)), [data.months]);

  const monthPicker = <label className="flex items-center gap-2 rounded-xl border border-[#263448] bg-[#080d15] px-3 py-2.5"><CalendarDays className="size-4 shrink-0 text-sky-300"/><input type="month" value={selectedMonth} onChange={e=>selectMonth(e.target.value)} className="min-w-0 bg-transparent text-sm text-slate-100 outline-none [color-scheme:dark]" aria-label="Pilih bulan Trading Plan"/></label>;

  return <div className="mx-auto max-w-6xl space-y-6 pb-8">
    <section className="flex flex-col gap-4 border-b border-[#202c3b] pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em] text-sky-300"><Wallet className="size-3.5"/>Personal performance journal</div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Trading Plan</h1><p className="mt-2 max-w-2xl text-xs leading-5 text-[#8190a5]">Catat target, hasil, dan evaluasi bulanan secara pribadi. Semua data disimpan di browser ini, terpisah dari News AI dan Economic Calendar.</p></div>
      <StatusBadge tone={storageStatus==="available"?"green":storageStatus==="invalid"?"red":"neutral"}>{storageStatus==="available"?"AUTO-SAVE ACTIVE":storageStatus==="invalid"?"DATA NEEDS ATTENTION":"LOCAL STORAGE UNAVAILABLE"}</StatusBadge>
    </section>

    {storageStatus==="unavailable"?<div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-[11px] leading-5 text-amber-200">Browser tidak mengizinkan localStorage. Fitur akan tetap bekerja selama halaman ini terbuka, tetapi data tidak dapat dijamin bertahan setelah browser ditutup. Coba keluar dari mode privat atau ubah izin penyimpanan browser.</div>:null}
    {storageStatus==="invalid"?<div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-[11px] leading-5 text-rose-200">Data Trading Plan yang tersimpan tidak valid atau tidak cocok dengan versi saat ini. Data lama tidak ditimpa sampai kamu melakukan perubahan atau mengimpor backup yang valid.</div>:null}

    <section className={cardStyle("p-4 sm:p-5")}>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#8190a5]">Monthly Target</div><div className="mt-2 text-sm text-slate-200">Target dan hasil untuk bulan yang dipilih</div></div>{monthPicker}</div>
      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><label className="block"><span className="mb-2 block text-[11px] text-[#a4b0c0]">Target bulanan (Rupiah)</span><div className="flex h-11 items-center rounded-xl border border-[#263448] bg-[#080d15] px-3 focus-within:border-sky-400/40"><span className="mr-2 text-xs text-[#8190a5]">Rp</span><input type="number" inputMode="numeric" min="0" step="1" value={targetDraft} onChange={e=>changeTargetDraft(e.target.value)} placeholder="5.000.000" className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-[#56657a]" aria-label="Target bulanan"/></div></label><button type="button" onClick={saveTarget} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 text-xs font-semibold text-slate-950 hover:bg-white"><Save className="size-3.5"/>Simpan target</button></div>
      {formError&&!formOpen?<p className="mt-2 text-[11px] text-rose-300">{formError}</p>:null}
      <div className="mt-6 grid gap-3 sm:grid-cols-3"><MetricCard label="Total hasil / Net result" value={formatSignedRupiah(stats.netResult)} icon={Wallet} tone={stats.netResult<0?"red":stats.netResult>0?"green":"neutral"} hint="Profit dikurangi loss"/><MetricCard label="Progress target" value={monthData.target>0?Math.round(stats.rawProgress)+"%":"—"} icon={Target} tone="neutral" hint="Berdasarkan net result"/><MetricCard label="Sisa target" value={stats.remainingTarget>0?formatRupiah(stats.remainingTarget):stats.remainingTarget<0?"Tercapai + "+formatRupiah(Math.abs(stats.remainingTarget)):formatRupiah(0)} icon={TrendingUp} tone={stats.remainingTarget<0?"green":"neutral"} hint={stats.remainingTarget<0?"Target telah terlampaui": "Target dikurangi net result"}/></div>
      <div className="mt-5"><div className="mb-2 flex items-center justify-between gap-3 text-[10px]"><span className="text-[#8190a5]">Pencapaian target</span><span className="font-semibold text-slate-200">{monthData.target>0?Math.round(stats.rawProgress)+"%":"Target belum diatur"}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-[#192433]"><div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-300 transition-[width] duration-300" style={{width:stats.progress+"%"}}/></div><div className="mt-2 text-[10px] text-[#8190a5]">{stats.netResult<0?"Net result masih negatif.":stats.progress>=100&&monthData.target>0?"Target bulanan tercapai.":"Progress bar dibatasi dari 0% sampai 100%."}</div></div>
    </section>

    <section className="grid gap-3 sm:grid-cols-3"><MetricCard label="Total Profit" value={formatRupiah(stats.totalProfit)} icon={TrendingUp} tone="green"/><MetricCard label="Total Loss" value={stats.totalLoss>0?"- "+formatRupiah(stats.totalLoss):formatRupiah(0)} icon={TrendingDown} tone="red"/><MetricCard label="Jumlah Record" value={String(stats.recordCount)} icon={FileJson} tone="neutral" hint={monthLabel(selectedMonth)}/></section>

    <section className={cardStyle("p-4 sm:p-5")}>
      <SectionTitle title="History" subtitle={"Record untuk "+monthLabel(selectedMonth)+". Record disimpan pada bulan masing-masing."} action={<button type="button" onClick={openAddForm} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-300 px-3 text-xs font-semibold text-slate-950 hover:bg-sky-200"><Plus className="size-4"/>Tambah Record</button>}/>
      {formOpen?<form onSubmit={saveRecord} className="mb-5 rounded-xl border border-sky-400/20 bg-[#080d15] p-4">
        <div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-semibold">{editing?"Edit Record":"Tambah Record"}</h3><button type="button" onClick={()=>{setFormOpen(false);setEditing(false);setFormError("")}} className="grid size-8 place-items-center rounded-lg text-[#8190a5] hover:bg-[#152131]" aria-label="Tutup form"><X className="size-4"/></button></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-[10px] text-[#a4b0c0]">Tanggal</span><input required type="date" min={selectedMonth+"-01"} max={monthEnd(selectedMonth)} value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})} className="h-10 w-full rounded-lg border border-[#263448] bg-[#0c121c] px-3 text-xs text-slate-100 [color-scheme:dark]"/></label><label className="block"><span className="mb-1.5 block text-[10px] text-[#a4b0c0]">Tipe</span><select value={draft.type} onChange={e=>setDraft({...draft,type:e.target.value as RecordType})} className="h-10 w-full rounded-lg border border-[#263448] bg-[#0c121c] px-3 text-xs text-slate-100"><option value="profit">Profit</option><option value="loss">Loss</option></select></label><label className="block"><span className="mb-1.5 block text-[10px] text-[#a4b0c0]">Nominal (Rp)</span><input required type="number" inputMode="numeric" min="1" step="1000" value={draft.amount} onChange={e=>setDraft({...draft,amount:e.target.value})} placeholder="300000" className="h-10 w-full rounded-lg border border-[#263448] bg-[#0c121c] px-3 text-xs text-slate-100 placeholder:text-[#56657a]"/></label><label className="block"><span className="mb-1.5 block text-[10px] text-[#a4b0c0]">Catatan (opsional)</span><input value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})} maxLength={500} placeholder="Evaluasi berita ekonomi" className="h-10 w-full rounded-lg border border-[#263448] bg-[#0c121c] px-3 text-xs text-slate-100 placeholder:text-[#56657a]"/></label></div>
        {formError?<p className="mt-3 text-[11px] text-rose-300">{formError}</p>:null}
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={()=>{setFormOpen(false);setEditing(false);setFormError("")}} className="h-10 rounded-lg border border-[#263448] px-4 text-xs text-[#a4b0c0] hover:bg-[#152131]">Batal</button><button type="submit" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 text-xs font-semibold text-slate-950 hover:bg-white"><Save className="size-3.5"/>Simpan</button></div>
      </form>:null}
      {visibleRecords.length===0?<div className="rounded-xl border border-dashed border-[#263448] px-5 py-12 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl border border-[#263448] bg-[#111925] text-[#8190a5]"><CalendarDays className="size-5"/></div><div className="mt-4 text-sm font-semibold">Belum ada catatan bulan ini.</div><p className="mt-1 text-xs text-[#8190a5]">Tambahkan record pertama Anda.</p><button type="button" onClick={openAddForm} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border border-[#2b3a4f] px-3 text-xs font-semibold hover:bg-[#152131]"><Plus className="size-3.5"/>Tambah Record</button></div>:<div className="space-y-2">{visibleRecords.map(record=><article key={record.id} className="flex items-start gap-3 rounded-xl border border-[#202c3b] bg-[#080d15]/65 p-3 sm:items-center sm:p-4"><div className={"mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl "+(record.type==="profit"?"bg-emerald-400/10 text-emerald-300":"bg-rose-400/10 text-rose-300")}>{record.type==="profit"?<TrendingUp className="size-4"/>:<TrendingDown className="size-4"/>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-slate-100">{new Intl.DateTimeFormat("id-ID",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(record.date+"T12:00:00"))}</span><StatusBadge tone={record.type==="profit"?"green":"red"}>{record.type==="profit"?"Profit":"Loss"}</StatusBadge></div><p className="mt-1 break-words text-[11px] leading-5 text-[#9ba9bc]">{record.note||"Tanpa catatan"}</p></div><div className="flex shrink-0 flex-col items-end gap-2"><div className={"text-sm font-semibold tabular-nums sm:text-base "+(record.type==="profit"?"text-emerald-300":"text-rose-300")}>{record.type==="profit"?"+ ":"- "}{formatRupiah(record.amount)}</div><div className="flex gap-1"><button type="button" onClick={()=>openEditForm(record)} aria-label="Edit record" className="grid size-8 place-items-center rounded-lg border border-[#263448] text-[#9ba9bc] hover:border-sky-400/30 hover:text-sky-200"><Pencil className="size-3.5"/></button><button type="button" onClick={()=>deleteRecord(record)} aria-label="Delete record" className="grid size-8 place-items-center rounded-lg border border-[#263448] text-[#9ba9bc] hover:border-rose-400/30 hover:text-rose-300"><Trash2 className="size-3.5"/></button></div></div></article>)}</div>}
    </section>

    <section className={cardStyle("p-4 sm:p-5")}>
      <SectionTitle title="Monthly History" subtitle="Pilih bulan untuk membuka target, history, dan evaluasinya."/>
      {monthlyHistory.length===0?<div className="rounded-xl border border-dashed border-[#263448] p-8 text-center text-xs text-[#8190a5]">Monthly History akan muncul setelah ada target, record, atau review yang tersimpan.</div>:<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{monthlyHistory.map(([month,plan])=>{const monthStats=calculateMonth(plan);const isSelected=month===selectedMonth;return <button key={month} type="button" onClick={()=>selectMonth(month)} className={"rounded-xl border p-4 text-left transition-colors "+(isSelected?"border-sky-400/35 bg-sky-400/5":"border-[#202c3b] bg-[#080d15]/65 hover:border-[#40536b]")}><div className="flex items-center justify-between gap-2"><div className="text-sm font-semibold">{monthLabel(month)}</div>{isSelected?<StatusBadge tone="green">Terpilih</StatusBadge>:null}</div><div className="mt-4 flex justify-between gap-3 text-[10px] text-[#8190a5]"><span>Target</span><span className="text-slate-200">{formatRupiah(plan.target)}</span></div><div className="mt-2 flex justify-between gap-3 text-[10px] text-[#8190a5]"><span>Net</span><span className={monthStats.netResult<0?"text-rose-300":"text-emerald-300"}>{formatSignedRupiah(monthStats.netResult)}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#192433]"><div className="h-full rounded-full bg-sky-300" style={{width:monthStats.progress+"%"}}/></div><div className="mt-2 flex justify-between gap-3 text-[10px] text-[#8190a5]"><span>Progress</span><span>{plan.target>0?Math.round(monthStats.rawProgress)+"%":"Target belum diatur"}</span></div></button>})}</div>}
    </section>

    <section className={cardStyle("p-4 sm:p-5")}>
      <SectionTitle title="Monthly Review" subtitle={"Evaluasi performa "+monthLabel(selectedMonth)+"; disimpan otomatis."}/>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><ReviewStat label="Target" value={formatRupiah(monthData.target)}/><ReviewStat label="Total Profit" value={formatRupiah(stats.totalProfit)} tone="green"/><ReviewStat label="Total Loss" value={stats.totalLoss>0?"- "+formatRupiah(stats.totalLoss):formatRupiah(0)} tone="red"/><ReviewStat label="Net Result" value={formatSignedRupiah(stats.netResult)} tone={stats.netResult<0?"red":stats.netResult>0?"green":"neutral"}/><ReviewStat label="Jumlah Record" value={String(stats.recordCount)}/><ReviewStat label="Pencapaian target" value={monthData.target>0?Math.round(stats.rawProgress)+"%":"—"}/></div>
      <label className="mt-5 block"><span className="mb-2 block text-[11px] font-medium text-[#a4b0c0]">Catatan evaluasi bulan ini</span><textarea value={monthData.review} onChange={e=>saveReview(e.target.value)} maxLength={5000} rows={4} placeholder="Apa yang berjalan baik? Apa yang perlu dievaluasi bulan depan?" className="w-full resize-y rounded-xl border border-[#263448] bg-[#080d15] p-3 text-xs leading-5 text-slate-100 outline-none placeholder:text-[#56657a] focus:border-sky-400/40"/></label><div className="mt-2 text-right text-[10px] text-[#8190a5]">{monthData.review.length}/5000 karakter · Tersimpan otomatis</div>
    </section>

    <section className={cardStyle("p-4 sm:p-5")}>
      <SectionTitle title="Backup Data" subtitle="Export semua bulan atau import file backup JSON untuk memulihkan data."/>
      <div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={exportBackup} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#263448] bg-[#111925] px-4 py-3 text-xs font-semibold hover:border-sky-400/30 hover:bg-[#162131]"><Download className="size-4 text-sky-300"/>Export Backup</button><button type="button" onClick={()=>fileInputRef.current?.click()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#263448] bg-[#111925] px-4 py-3 text-xs font-semibold hover:border-sky-400/30 hover:bg-[#162131]"><Upload className="size-4 text-sky-300"/>Import Backup</button><input ref={fileInputRef} type="file" accept=".json,application/json" onChange={importBackup} className="hidden" aria-label="Pilih file backup JSON"/></div>
      {importMessage?<p className="mt-3 text-[11px] leading-5 text-[#a4b0c0]" role="status">{importMessage}</p>:null}
      <div className="mt-4 flex flex-col gap-3 border-t border-[#202c3b] pt-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-semibold text-slate-100">Reset Data Bulan Ini</div><p className="mt-1 max-w-xl text-[10px] leading-5 text-[#8190a5]">Hanya menghapus target, record, dan review pada bulan yang dipilih. Bulan lain tidak terpengaruh.</p></div><button type="button" onClick={resetMonth} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-rose-400/20 px-3 text-xs font-semibold text-rose-300 hover:bg-rose-400/5"><RotateCcw className="size-3.5"/>Reset bulan ini</button></div>
    </section>

    {notice?<div role="status" aria-live="polite" className="fixed bottom-4 left-4 right-4 z-[70] mx-auto flex max-w-sm items-center gap-2 rounded-xl border border-emerald-400/20 bg-[#0d1918] px-4 py-3 text-xs font-medium text-emerald-200 shadow-2xl"><CheckCircle2 className="size-4 shrink-0"/>{notice}</div>:null}
  </div>;
}

function ReviewStat({label,value,tone="neutral"}:{label:string;value:string;tone?:string}) {
  const valueColor=tone==="green"?"text-emerald-300":tone==="red"?"text-rose-300":"text-slate-100";
  return <div className="rounded-xl border border-[#202c3b] bg-[#080d15]/65 p-3"><div className="text-[10px] text-[#8190a5]">{label}</div><div className={"mt-2 break-words text-sm font-semibold "+valueColor}>{value}</div></div>;
}
