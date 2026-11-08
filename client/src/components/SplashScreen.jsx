export default function SplashScreen() {
  return (
    <div className="app-loader" role="status" aria-label="Loading QuickLink">
      <div className="app-loader-content">
        <span className="app-loader-mark" aria-hidden="true">QL</span>
        <span className="text-sm font-medium">QuickLink</span>
        <span className="app-loader-spinner" aria-hidden="true" />
      </div>
    </div>
  );
}
