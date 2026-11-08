export default function SplashScreen() {
  return (
    <div className="app-loader" role="status" aria-label="Loading IshConnect">
      <div className="app-loader-content">
        <span className="app-loader-mark" aria-hidden="true">IC</span>
        <span className="text-sm font-medium">IshConnect</span>
        <span className="app-loader-spinner" aria-hidden="true" />
      </div>
    </div>
  );
}
