export default function SplashScreen() {
  return (
    <main className="app-loader" role="status" aria-label="Loading QuickLink">
      <div className="app-loader-card">
        <span className="app-loader-mark" aria-hidden="true">QL</span>
        <p className="app-loader-brand">QuickLink</p>
        <p className="app-loader-message">Preparing your learning space</p>
        <span className="app-loader-spinner" aria-hidden="true" />
        <span className="sr-only">Please wait while QuickLink loads.</span>
      </div>
    </main>
  );
}
