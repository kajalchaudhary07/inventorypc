import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Boxes, Lock, Mail, Sparkles } from "lucide-react";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import { useAuthStore } from "@/store/authStore";
import { Button, Input } from "@/components/ui/primitives";
import { logActivity } from "@/services/data";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const demoLogin = () => {
    useAuthStore.getState().setUser({ uid: "demo-admin", email: "admin@salon.demo" });
    logActivity("User Login", "session", "Logged in successfully", "demo-admin");
  };

  const submit = async () => {
    if (!isFirebaseConfigured || !auth) return demoLogin();
    setErr(""); setBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), pw);
      if (cred.user) {
        useAuthStore.getState().setUser({ uid: cred.user.uid, email: cred.user.email ?? "" });
        logActivity("User Login", "session", "Logged in successfully", cred.user.uid);
      }
    } catch (e: any) {
      console.error("Firebase Sign-in error:", e);
      const code = e.code ?? "";
      const message = e.message ?? "Unknown error";
      const map: Record<string, string> = {
        "auth/invalid-credential": "Incorrect email or password.",
        "auth/invalid-email": "That email looks invalid.",
        "auth/user-not-found": "No account found for that email.",
        "auth/wrong-password": "Incorrect password.",
        "auth/too-many-requests": "Too many attempts. Try again later.",
      };
      setErr(map[code] || `Sign-in failed: ${message} (${code})`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl dark:bg-slate-800">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900">
            <Boxes className="h-6 w-6" />
          </div>
          <div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">Salon Inventory</div>
            <div className="text-xs text-slate-500">Super Admin Console</div>
          </div>
        </div>

        {isFirebaseConfigured ? (
          <>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
            <div className="relative mb-3">
              <Mail className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="admin@yoursalon.com" className="pl-9" />
            </div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="••••••••" className="pl-9" />
            </div>
            {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
            <Button className="mt-5 w-full" onClick={submit} disabled={busy || !email || !pw}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-400">
              Restricted to authorized super-admins. Access is enforced by Firebase Auth and Firestore rules.
            </p>
          </>
        ) : (
          <>
            <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900">
              Running in <b>demo mode</b> with sample data. Add your Firebase keys to <code>.env</code> to enable real email/password login and live data.
            </div>
            <Button className="mt-5 w-full" onClick={demoLogin}>
              <Sparkles className="h-4 w-4" /> Enter demo dashboard
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
