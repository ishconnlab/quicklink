import { BrainCircuit, Code2, GraduationCap, Sparkles } from 'lucide-react';

export default function AuthLearningVisual() {
  return <div className="relative my-7 h-56 overflow-hidden rounded-3xl border border-green-100 bg-green-50 p-5" aria-label="Student learning programming and AI">
    <div className="absolute right-5 top-5 animate-bounce rounded-xl border border-green-100 bg-white p-2 text-green-700 shadow-sm [animation-duration:3.5s]"><BrainCircuit size={22} /><span className="mt-1 block text-[9px] font-bold">AI / ML</span></div>
    <div className="absolute bottom-5 left-5 flex h-40 w-[68%] flex-col rounded-xl border border-slate-700 bg-slate-900 p-3 text-green-300 shadow-xl">
      <div className="mb-2 flex gap-1"><i className="h-1.5 w-1.5 rounded-full bg-red-400"/><i className="h-1.5 w-1.5 rounded-full bg-amber-300"/><i className="h-1.5 w-1.5 rounded-full bg-green-400"/></div>
      <code className="space-y-1 text-[10px] leading-4"><span className="block text-emerald-300">def build_future():</span><span className="block pl-3 text-sky-300">skills = ["code", "AI"]</span><span className="block pl-3 text-amber-200">return learn(skills)</span><span className="mt-1 block text-slate-400">&gt; model ready · 98%</span></code>
    </div>
    <div className="absolute bottom-7 right-7 flex h-28 w-24 items-center justify-center rounded-t-[3rem] rounded-b-2xl border border-green-200 bg-white text-green-700 shadow-md"><div className="absolute -top-2 flex h-12 w-12 items-center justify-center rounded-full border-4 border-white bg-amber-100 text-amber-800"><GraduationCap size={24}/></div><div className="mt-10 text-center"><Sparkles className="mx-auto" size={17}/><p className="mt-1 text-[9px] font-bold">LEARN · BUILD</p></div></div>
    <div className="absolute right-4 top-1/2 animate-pulse rounded-full bg-green-100 p-2 text-green-700"><Code2 size={16}/></div>
  </div>;
}
