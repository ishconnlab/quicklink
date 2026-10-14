export default function SplashScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-700 text-lg font-bold text-white">
          QL
        </div>
        <p className="text-sm font-semibold tracking-wide text-slate-700">QuickLink</p>
        <div className="h-1 w-28 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-brand-600" />
        </div>
      </div>
    </div>
  );
}
