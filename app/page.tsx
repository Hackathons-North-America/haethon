export default function Home() {
  // Signed-in visitors are redirected into the app by the proxy, keeping this
  // page fully static.
  return <main className="min-h-screen bg-paper text-ink" />;
}
