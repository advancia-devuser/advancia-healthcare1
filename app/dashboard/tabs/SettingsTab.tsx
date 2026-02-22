import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, ShieldCheck, MessageCircle, Mail, Bell, Loader2, Copy } from "lucide-react";

export default function SettingsTab({
  profileForm,
  setProfileForm,
  profile,
  addr,
  handleSaveProfile,
  actionLoading,
  client,
  toast,
}: any) {
  return (
    <div className="grid md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Profile */}
      <Card className="shadow-sm border-gray-200/60">
        <CardHeader className="border-b border-gray-100 pb-4 mb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-800">
            <div className="p-1.5 bg-blue-100 rounded-md">
              <User className="w-4 h-4 text-blue-600" />
            </div>
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Full Name</label>
            <input type="text" placeholder="Your name" className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Email</label>
            <input type="email" placeholder="your@email.com" className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Phone</label>
            <input type="tel" placeholder="+1..." className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} />
          </div>
          <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Wallet Address</p>
            <p className="font-mono text-sm text-gray-800 break-all">{addr}</p>
          </div>
          <Button className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/20 rounded-xl mt-2" onClick={handleSaveProfile} disabled={actionLoading}>
            {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save Profile"}
          </Button>
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="shadow-sm border-gray-200/60">
        <CardHeader className="border-b border-gray-100 pb-4 mb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-800">
            <div className="p-1.5 bg-green-100 rounded-md">
              <ShieldCheck className="w-4 h-4 text-green-600" />
            </div>
            Security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 border border-gray-100 rounded-xl flex justify-between items-center hover:bg-gray-50 transition-colors">
            <div>
              <p className="font-semibold text-sm text-gray-900">Two-Factor Auth (2FA)</p>
              <p className="text-xs text-gray-500 font-medium">Add extra security to your account</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${profile?.has2FA ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
              {profile?.has2FA ? "Enabled" : "Disabled"}
            </span>
          </div>
          <div className="p-4 border border-gray-100 rounded-xl flex justify-between items-center hover:bg-gray-50 transition-colors">
            <div>
              <p className="font-semibold text-sm text-gray-900">Transaction PIN</p>
              <p className="text-xs text-gray-500 font-medium">Required for sending funds</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${profile?.hasPin ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
              {profile?.hasPin ? "Set" : "Not Set"}
            </span>
          </div>
          <div className="p-4 border border-gray-100 rounded-xl flex justify-between items-center hover:bg-gray-50 transition-colors">
            <div>
              <p className="font-semibold text-sm text-gray-900">Account Status</p>
              <p className="text-xs text-gray-500 font-medium">Your current approval status</p>
            </div>
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-[10px] font-bold uppercase tracking-wider">{profile?.status}</span>
          </div>
        </CardContent>
      </Card>

      {/* Wallet Backup & Export */}
      <Card className="shadow-sm border-gray-200/60">
        <CardHeader className="border-b border-gray-100 pb-4 mb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-800">
            <div className="p-1.5 bg-red-100 rounded-md">
              <ShieldCheck className="w-4 h-4 text-red-600" />
            </div>
            Wallet Backup & Export
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600 font-medium">
            Your wallet is secured by Alchemy Account Kit with embedded signers.
            Keys are sharded and never stored in a single place.
          </p>
          <div className="p-4 border border-gray-100 rounded-xl space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-semibold text-sm text-gray-900">Signer Address (EOA)</p>
                <p className="font-mono text-xs text-gray-600 break-all mt-1">{addr}</p>
              </div>
              <Button variant="ghost" size="sm" className="shrink-0 h-8 w-8 p-0" onClick={() => {
                navigator.clipboard.writeText(addr);
                toast.success("Copied", "Signer address copied");
              }}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
          {client && (
            <div className="p-4 border border-red-100 bg-red-50/50 rounded-xl space-y-3">
              <p className="font-semibold text-sm text-red-800">⚠️ Export Private Key</p>
              <p className="text-xs text-red-700">
                Exporting your private key gives full control of your signer wallet.
                Never share it. Store it offline in a secure location.
              </p>
              <Button variant="outline" size="sm"
                className="border-red-200 text-red-700 hover:bg-red-100"
                onClick={async () => {
                  try {
                    const confirmed = window.confirm(
                      "SECURITY WARNING:\n\n" +
                      "Your private key will be shown on screen.\n" +
                      "Make sure no one is watching your screen.\n" +
                      "Never share your private key with anyone.\n\n" +
                      "Continue?"
                    );
                    if (!confirmed) return;

                    toast.info(
                      "Export via Account Kit",
                      "Visit your Alchemy Account Kit dashboard to export your signer key securely. Go to: https://dashboard.alchemy.com"
                    );
                  } catch (err: any) {
                    toast.error("Export failed", err.message);
                  }
                }}>
                Export Signer Key
              </Button>
            </div>
          )}
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-xs text-blue-700 font-medium">
              💡 Your smart account is recoverable through your login method (email, social, passkey).
              The embedded signer key is managed securely by Alchemy&apos;s infrastructure.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Support */}
      <Card className="shadow-sm border-gray-200/60">
        <CardHeader className="border-b border-gray-100 pb-4 mb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-800">
            <div className="p-1.5 bg-purple-100 rounded-md">
              <MessageCircle className="w-4 h-4 text-purple-600" />
            </div>
            Support
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 font-medium mb-6">Need help with your wallet, cards, or transfers?</p>
          <div className="grid grid-cols-2 gap-4">
            <Button variant="outline" className="h-24 flex flex-col gap-3 border-gray-200 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 transition-all rounded-xl">
              <MessageCircle className="w-6 h-6 text-blue-600" /><span className="font-semibold">Live Chat</span>
            </Button>
            <Button variant="outline" className="h-24 flex flex-col gap-3 border-gray-200 hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700 transition-all rounded-xl">
              <Mail className="w-6 h-6 text-purple-600" /><span className="font-semibold">Email Support</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card className="shadow-sm border-gray-200/60">
        <CardHeader className="border-b border-gray-100 pb-4 mb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-800">
            <div className="p-1.5 bg-orange-100 rounded-md">
              <Bell className="w-4 h-4 text-orange-600" />
            </div>
            Notification Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 border border-gray-100 rounded-xl flex justify-between items-center hover:bg-gray-50 transition-colors">
            <div>
              <p className="font-semibold text-sm text-gray-900">In-App Notifications</p>
              <p className="text-xs text-gray-500 font-medium">Bell icon alerts in the dashboard</p>
            </div>
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-[10px] font-bold uppercase tracking-wider">Always On</span>
          </div>
          <div className="p-4 border border-gray-100 rounded-xl flex justify-between items-center hover:bg-gray-50 transition-colors">
            <div>
              <p className="font-semibold text-sm text-gray-900">Email Notifications</p>
              <p className="text-xs text-gray-500 font-medium">Receive alerts via email</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${profileForm.email ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
              {profileForm.email ? "Active" : "Add Email"}
            </span>
          </div>
          <div className="p-4 border border-gray-100 rounded-xl flex justify-between items-center hover:bg-gray-50 transition-colors">
            <div>
              <p className="font-semibold text-sm text-gray-900">SMS Notifications</p>
              <p className="text-xs text-gray-500 font-medium">Critical alerts via text message</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${profileForm.phone ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
              {profileForm.phone ? "Active" : "Add Phone"}
            </span>
          </div>
          {(!profileForm.email || !profileForm.phone) && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl p-3 font-medium">
              💡 Add your email and phone number in the Profile section above to enable all notification channels.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
