import { useState, useRef, useEffect } from "react";
import Layout from "@/components/layout/Layout";
import { NeonButton } from "@/components/ui/neon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/page-primitives";
import { Camera, Check, Eye, EyeOff, User } from "lucide-react";
import { useUser, defaultAvatars } from "@/lib/userContext";

const cardCls =
  "card-3d rounded-2xl border border-border bg-gradient-to-b from-card to-muted/40 p-6 dark:to-[hsl(252_30%_7%)]";

export default function Profile() {
  const { profile, updateProfile } = useUser();
  
  const [username, setUsername] = useState(profile.username);
  const [email, setEmail] = useState(profile.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState(profile.selectedAvatarIndex);
  const [customAvatar, setCustomAvatar] = useState<string | null>(
    profile.avatarType === "image" ? profile.avatar : null
  );
  const [saveSuccess, setSaveSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUsername(profile.username);
    setEmail(profile.email);
    setSelectedAvatar(profile.selectedAvatarIndex);
    setCustomAvatar(profile.avatarType === "image" ? profile.avatar : null);
  }, [profile]);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCustomAvatar(reader.result as string);
        setSelectedAvatar(-1);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSave = () => {
    const avatarData = customAvatar 
      ? { avatar: customAvatar, avatarType: "image" as const, selectedAvatarIndex: -1 }
      : { avatar: defaultAvatars[selectedAvatar], avatarType: "gradient" as const, selectedAvatarIndex: selectedAvatar };
    
    updateProfile({
      username,
      email,
      ...avatarData,
    });
    
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const getCurrentAvatar = () => {
    if (customAvatar) {
      return { type: "image", value: customAvatar };
    }
    return { type: "gradient", value: defaultAvatars[selectedAvatar] || defaultAvatars[0] };
  };

  const avatar = getCurrentAvatar();
  const isCustomAvatarSelected = customAvatar !== null;

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Eyebrow>Account</Eyebrow>
          <h1 className="mt-3 text-3xl font-display font-bold tracking-tight text-foreground mb-1">
            Profile <span className="text-gradient">Settings</span>
          </h1>
          <p className="text-muted-foreground">Manage your account information and preferences.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Profile Picture */}
          <div className={`${cardCls} relative overflow-hidden`}>
            <span className="aurora-blob aurora-blob--primary pointer-events-none left-1/2 top-0 h-48 w-48 -translate-x-1/2 mix-blend-screen" />
            <h3 className="relative text-lg font-semibold text-foreground mb-6">Profile Picture</h3>

            <div className="relative flex flex-col items-center mb-6">
              <div className="gradient-ring relative mb-4 rounded-full p-1">
                {avatar.type === "image" ? (
                  <img
                    src={avatar.value}
                    alt="Profile"
                    className="w-24 h-24 rounded-full object-cover border-4 border-white dark:border-slate-800 shadow-lg"
                  />
                ) : (
                  <div
                    className="w-24 h-24 rounded-full border-4 border-white dark:border-slate-800 shadow-lg flex items-center justify-center"
                    style={{ background: avatar.value }}
                  >
                    <User className="w-10 h-10 text-white/80" />
                  </div>
                )}
                <label 
                  htmlFor="avatar-upload"
                  className="absolute bottom-0 right-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center cursor-pointer shadow-lg hover:bg-primary/90 transition-colors"
                >
                  <Camera className="w-4 h-4 text-white" />
                </label>
                <input
                  ref={fileInputRef}
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </div>
              <p className="relative text-sm text-muted-foreground">{username}</p>
            </div>

            <div className="relative space-y-3">
              <p className="text-sm font-medium text-foreground">Choose a default avatar</p>
              <div className="flex flex-wrap gap-3 justify-center">
                {defaultAvatars.map((gradient, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setSelectedAvatar(index);
                      setCustomAvatar(null);
                    }}
                    className={`w-14 h-14 rounded-full transition-all duration-200 flex items-center justify-center ${
                      selectedAvatar === index && !isCustomAvatarSelected
                        ? "ring-4 ring-primary ring-offset-2 dark:ring-offset-slate-900 scale-110"
                        : "hover:scale-105"
                    }`}
                    style={{ background: gradient }}
                  >
                    <User className="w-6 h-6 text-white/80" />
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Or upload your own picture using the camera icon above
              </p>
            </div>
          </div>

          {/* Basic Information */}
          <div className={cardCls}>
            <h3 className="text-lg font-semibold text-foreground mb-6">Basic Information</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-foreground">Username</Label>
                <Input 
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  className="bg-slate-50 dark:bg-slate-950/50 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground">Email Address</Label>
                <Input 
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="bg-slate-50 dark:bg-slate-950/50 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Change Password */}
          <div className={cardCls}>
            <h3 className="text-lg font-semibold text-foreground mb-6">Change Password</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password" className="text-foreground">Current Password</Label>
                <div className="relative">
                  <Input 
                    id="current-password"
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="bg-slate-50 dark:bg-slate-950/50 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  >
                    {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-password" className="text-foreground">New Password</Label>
                <div className="relative">
                  <Input 
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="bg-slate-50 dark:bg-slate-950/50 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-foreground">Confirm New Password</Label>
                <div className="relative">
                  <Input 
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="bg-slate-50 dark:bg-slate-950/50 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Save Actions Sidebar */}
        <div className="space-y-6">
          <div className={`${cardCls} sticky top-6`}>
            <h3 className="text-lg font-semibold text-foreground mb-6">Account Actions</h3>

            <div className="space-y-4 mb-6">
              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <p className="text-xs text-muted-foreground mb-1">Account Status</p>
                <p className="text-sm font-mono text-emerald-500">Active</p>
              </div>

              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <p className="text-xs text-muted-foreground mb-1">Member Since</p>
                <p className="text-sm font-mono text-primary">Nov 2025</p>
              </div>

              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <p className="text-xs text-muted-foreground mb-1">Role</p>
                <p className="text-sm font-mono text-accent">{profile.role || "Tester"}</p>
              </div>
            </div>

            {saveSuccess && (
              <div className="mb-4 p-3 rounded-lg bg-green-100 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                <p className="text-sm text-green-700 dark:text-green-400">Changes saved successfully!</p>
              </div>
            )}
            
            <div className="space-y-3">
              <NeonButton 
                className="w-full" 
                neonColor="cyan"
                onClick={handleSave}
              >
                <Check className="w-4 h-4 mr-2" /> Save Changes
              </NeonButton>
              <Button variant="outline" className="w-full border-border hover:bg-muted/50">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
