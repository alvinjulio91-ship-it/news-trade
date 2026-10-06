import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw, Search, ShieldCheck, Sparkles } from "lucide-react";
import { useNavigate } from "react-router";
import { isSupabaseConfigured, requireSupabase } from "../lib/supabase";

type EventRow={id:string;event_name:string;country:string;currency:string|null;event_time:string;importance:string;previous:number|null;forecast:number|null;actual:number|null;status:string;category:string|null;related_asset:string|null};
type Scenario={event_id:string;scenario_type:string;confidence:number;reasoning:string;gold_impact:string};
type News={headline:string;source_name:string;source_url:string;published_at:string|null;summary:string;source_verified:boolean};

const ranges=[1,3,7,14];
const categories=["All","Inflation","Employment","Fed","GDP","PMI","Consumer","Retail","Housing","Manufacturing"];
const fmtDate=(v:string)=>new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(v));
const fmtTime=(v:string)=>new Intl.DateTimeFormat("id-ID",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Jakarta"}).format(new Date(v))+" WIB";
const pill=(tone:string)=>tone==="green"?"border-emerald-400/20 bg-emerald-400/10 text-emerald-300":tone==="amber"?"border-amber-400/20 bg-amber-400/10 text-amber-300":"border-sky-400/20 bg-sky-400/10 text-sky-300";

function Panel({children,className=""}:{children:React.ReactNode;className?:string}){return <div className={"rounded-xl border border-[#1c2938] bg-[#0c121c] "+className}>{children}</div>}
function Badge({children,tone="blue"}:{children:React.ReactNode;tone?:string}){return <span className={"inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide "+pill(tone)}>{children}</span>}
function ScenarioLabel({type}:{type:string}){return <>{type==="above_forecast"?"Potentially ABOVE FORECAST":type==="below_forecast"?"Potentially BELOW FORECAST":"Potentially NEAR FORECAST"}</>}

export default function EconomicIntelligencePage(){
  const nav=useNavigate();
  const [range,setRange]=useState(14),[category,setCategory]=useState("All"),[search,setSearch]=useState(""),[searchLoading,setSearchLoading]=useState(false);
  const [events,setEvents]=useState<EventRow[]>([]),[scenarios,setScenarios]=useState<Scenario[]>([]),[news,setNews]=useState<News[]>([]);
  const [loading,setLoading]=useState(false),[error,setError]=useState(""),[retrieved,setRetrieved]=useState<string|null>(null);
  const runSearch=async()=>{
    const q=search.trim(); if(!q||!isSupabaseConfigured) return;
    setSearchLoading(true); setError("");
    const {data,error:fnError}=await requireSupabase().functions.invoke("economic-intelligence",{body:{operation:"search",query:q,range_days:range,filters:{category}}});
    if(fnError||data?.error)setError(fnError?.message??data.error); else setNews((data?.results??[]) as News[]);
    setSearchLoading(false);
  };
  const load=useCallback(async()=>{
    setLoading(true);setError("");
    if(!isSupabaseConfigured){setError("Supabase belum dikonfigurasi.");setLoading(false);return}
    const {data,error:fnError}=await requireSupabase().functions.invoke("economic-intelligence",{body:{operation:"calendar",range_days:range,category}});
    if(fnError||data?.error){setError(fnError?.message??data.error);setLoading(false);return}
    const all=[...(data?.released??[]),...(data?.upcoming??[])] as EventRow[];
    setEvents(all);setNews((data?.news??[]) as News[]);setRetrieved(data?.retrieved_at??null);
    if(all.length){const ids=all.map(e=>e.id);const {data:rows}=await requireSupabase().from("economic_event_scenarios").select("*").in("event_id",ids);setScenarios((rows??[]) as Scenario[])}else setScenarios([]);
    setLoading(false);
  },[range,category]);
  useEffect(()=>{void load()},[load]);

  const released=useMemo(()=>events.filter(e=>e.status==="released").sort((a,b)=>+new Date(b.event_time)-+new Date(a.event_time)),[events]);
  const upcoming=useMemo(()=>events.filter(e=>e.status==="upcoming").sort((a,b)=>+new Date(a.event_time)-+new Date(b.event_time)),[events]);
  const filteredNews=useMemo(()=>search.trim()?news.filter(n=>(n.headline+" "+n.summary).toLowerCase().includes(search.toLowerCase())):news,[news,search]);
  const focus=upcoming[0];
  const focusScenarios=scenarios.filter(s=>s.event_id===focus?.id).sort((a,b)=>b.confidence-a.confidence);

  return <div className="space-y-6">
    <section className="flex flex-col gap-4 border-b border-[#1c2938] pb-5 xl:flex-row xl:items-end xl:justify-between">
      <div><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em] text-sky-300/80"><Sparkles className="size-3.5"/>INTELLIGENCE TERMINAL</div><h1 className="text-2xl font-semibold tracking-tight">AI Economic Intelligence</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#7f8da3]">US macro search, release tracking, evidence, scenarios, Gold impact, and source verification in one terminal view.</p></div>
      <div className="flex flex-wrap gap-2"><Badge tone="green">SOURCE VERIFIED</Badge><Badge>OFFICIAL ≠ AI ESTIMATE</Badge><Badge tone="amber">SCENARIO, NOT CERTAINTY</Badge></div>
    </section>

    <Panel className="p-4">
      <form onSubmit={e=>{e.preventDefault();void runSearch()}} className="flex flex-col gap-3 lg:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#7f8da3]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search US Economic Intelligence..." className="h-10 w-full rounded-md border border-[#1c2938] bg-[#080d15] pl-9 pr-3 text-sm outline-none placeholder:text-[#7f8da3]"/></div><button type="submit" disabled={searchLoading||!search.trim()} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-sky-400/20 bg-sky-400/10 px-4 text-xs font-semibold text-sky-200 disabled:opacity-60">{searchLoading?"Searching…":"Search intelligence"}</button><button type="button" onClick={()=>void load()} disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#1c2938] bg-[#111925] px-4 text-xs font-semibold disabled:opacity-60"><RefreshCw className={loading?"size-3.5 animate-spin":"size-3.5"}/>Refresh intelligence</button></form>
      <div className="mt-4 flex flex-col gap-3 border-t border-[#1c2938]/70 pt-4"><div className="flex flex-wrap gap-1.5">{ranges.map(x=><button key={x} onClick={()=>setRange(x)} className={"rounded-md border px-3 py-1.5 text-[10px] font-semibold "+(range===x?"border-sky-400/30 bg-sky-400/10 text-sky-200":"border-[#1c2938] text-[#7f8da3]")}>NEXT {x} {x===1?"DAY":"DAYS"}</button>)}</div><div className="flex flex-wrap gap-1.5">{categories.map(x=><button key={x} onClick={()=>setCategory(x)} className={"rounded-md px-2.5 py-1.5 text-[10px] "+(category===x?"bg-[#162131] text-foreground":"text-[#7f8da3]")}>{x}</button>)}</div></div>
    </Panel>

    {error?<Panel className="border-amber-400/20 bg-amber-400/5 p-4"><div className="text-xs font-semibold text-amber-200">Intelligence unavailable</div><div className="mt-1 text-xs text-amber-200/70">{error}</div></Panel>:null}

    <div className="grid gap-4 xl:grid-cols-4">{[
      ["WHAT JUST RELEASED?",released[0]?.event_name??"—"],["WHAT'S COMING NEXT?",focus?.event_name??"—"],["OFFICIAL FORECAST",focus?.forecast??"—"],["AI EXPECTATION",focusScenarios[0]?focusScenarios[0].scenario_type==="above_forecast"?"Potentially ABOVE FORECAST":focusScenarios[0].scenario_type==="below_forecast"?"Potentially BELOW FORECAST":"Potentially NEAR FORECAST":"Insufficient evidence"]
    ].map(([a,b])=><Panel key={a} className="p-4"><div className="text-[9px] uppercase tracking-[.16em] text-[#7f8da3]">{a}</div><div className="mt-3 text-sm font-semibold">{b}</div></Panel>)}</div>

    <div className="grid gap-5 xl:grid-cols-2">
      <EventTable title="RELEASED DATA" tone="green" rows={released} open={id=>nav("/economic-intelligence/"+id)} released/>
      <EventTable title="UPCOMING DATA" tone="amber" rows={upcoming} open={id=>nav("/economic-intelligence/"+id)}/>
    </div>

    <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <Panel><div className="border-b border-[#1c2938] p-5"><div className="text-sm font-semibold">AI Scenario</div><div className="mt-1 text-[11px] text-[#7f8da3]">Confidence score is model confidence, not a guaranteed market probability.</div></div>{focusScenarios.length?focusScenarios.map(s=><div key={s.scenario_type} className="grid gap-3 border-b border-[#1c2938]/70 p-4 last:border-0 md:grid-cols-[1fr_80px_1.5fr] md:items-center"><div><div className="text-xs font-semibold"><ScenarioLabel type={s.scenario_type}/></div><div className="mt-1 text-[10px] text-[#7f8da3]">{s.gold_impact}</div></div><div className="text-sm font-semibold">{Math.round(s.confidence)}/100</div><div className="text-[10px] leading-5 text-[#7f8da3]">{s.reasoning}</div></div>):<div className="p-10 text-center text-xs text-[#7f8da3]">Insufficient evidence.</div>}</Panel>
      <Panel><div className="border-b border-[#1c2938] p-5"><div className="text-sm font-semibold">NEWS</div><div className="mt-1 text-[11px] text-[#7f8da3]">Recent search results with source verification.</div></div>{filteredNews.slice(0,7).map((n,i)=><div key={n.source_url+i} className="border-b border-[#1c2938]/70 p-4 last:border-0"><div className="flex items-center gap-2">{n.source_verified?<Badge tone="green">SOURCE VERIFIED</Badge>:<Badge tone="amber">UNVERIFIED</Badge>}<span className="text-[10px] text-[#7f8da3]">{n.source_name}</span></div><a href={n.source_url} target="_blank" rel="noreferrer" className="mt-2 block text-xs font-semibold hover:text-sky-300">{n.headline}</a><p className="mt-1 text-[10px] leading-5 text-[#7f8da3]">{n.summary}</p></div>)}{!filteredNews.length?<div className="p-10 text-center text-xs text-[#7f8da3]">No news result.</div>:null}</Panel>
    </div>
    <Panel className="flex flex-col gap-2 p-4 text-[10px] text-[#7f8da3] sm:flex-row sm:justify-between"><span>Retrieved: {retrieved?new Date(retrieved).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Jakarta"})+" WIB":"—"}</span><span>Official Data → Official Forecast → AI Estimate → Market Scenario</span></Panel>
  </div>
}

function EventTable({title,tone,rows,open,released=false}:{title:string;tone:string;rows:EventRow[];open:(id:string)=>void;released?:boolean}){
  return <Panel className="overflow-hidden"><div className="flex items-center justify-between border-b border-[#1c2938] p-5"><div><div className="text-sm font-semibold">{title}</div><div className="mt-1 text-[11px] text-[#7f8da3]">{released?"Published economic data":"Scheduled US macro releases"}</div></div><Badge tone={tone}>{released?"RELEASED":"UPCOMING"}</Badge></div>{rows.length?<div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="border-b border-[#1c2938] text-[9px] uppercase tracking-[.16em] text-[#7f8da3]"><tr>{["Event","Release","Previous","Forecast","Actual","Importance","Gold"].map(h=><th key={h} className="px-5 py-3">{h}</th>)}</tr></thead><tbody>{rows.map(e=><tr key={e.id} className="border-b border-[#1c2938]/70 last:border-0 hover:bg-[#111925]/30"><td className="px-5 py-3"><button onClick={()=>open(e.id)} className="text-left font-semibold hover:text-sky-300">{e.event_name}</button><div className="mt-1 text-[10px] text-[#7f8da3]">{e.country} · {e.currency??"USD"}</div></td><td className="px-5 py-3"><div>{fmtDate(e.event_time)}</div><div className="text-[10px] text-[#7f8da3]">{fmtTime(e.event_time)}</div></td><td className="px-5 py-3">{e.previous??"—"}</td><td className="px-5 py-3">{e.forecast??"—"}</td><td className="px-5 py-3">{e.actual??"—"}</td><td className="px-5 py-3"><Badge tone={e.importance.toLowerCase()==="high"?"amber":"blue"}>{e.importance}</Badge></td><td className="px-5 py-3 text-[#7f8da3]">{e.related_asset==="XAUUSD"?"XAUUSD":"Context"}</td></tr>)}</tbody></table></div>:<div className="p-10 text-center text-xs text-[#7f8da3]">No data available from the source layer.</div>}</Panel>
}
