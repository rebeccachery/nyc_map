import Link from "next/link";

export default function MapNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <h1 className="text-xl font-bold">Metro not found</h1>
      <p className="mt-2 text-sm text-zinc-400">That map region is not available yet.</p>
      <Link
        href="/"
        className="mt-6 text-sm font-semibold text-orange-400 hover:text-orange-300"
      >
        Choose a metro area →
      </Link>
    </div>
  );
}
