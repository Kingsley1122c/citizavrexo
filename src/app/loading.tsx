export default function Loading() {
  return <main className="route-state" aria-busy="true" aria-label="Loading Nivora Core">
    <div className="brand"><span className="brand-mark"><i/></span><span>Nivora <b>Core</b></span></div>
    <section className="panel route-state-panel">
      <span className="loading-mark"/>
      <h1>Loading your workspace</h1>
      <p>Your account information is being prepared securely.</p>
    </section>
  </main>;
}
