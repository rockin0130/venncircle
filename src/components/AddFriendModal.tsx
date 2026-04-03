import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QrCode, Contact, Hash, Mail, Phone, ArrowLeft, Search, Copy, Check, Loader2, UserPlus } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "@/hooks/use-toast";
import QRCode from "react-qr-code";
import type { FriendProfile } from "@/hooks/useFriendships";

type Screen = "main" | "qr" | "contacts" | "id";
type ContactMethod = "email" | "phone";

interface AddFriendModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSendRequest?: (userId: string) => Promise<{ error?: string; success?: boolean }>;
  searchUsers?: (identifier: string) => Promise<{ error?: string; results: FriendProfile[] }>;
}

const OPTIONS = [
  { key: "qr" as const, icon: QrCode, label: "QR Code", hint: "Best for adding someone in person" },
  { key: "contacts" as const, icon: Contact, label: "Contacts", hint: "Use email or phone number" },
  { key: "id" as const, icon: Hash, label: "ID", hint: "Search by username or app ID" },
];

const AddFriendModal = ({ open, onOpenChange, onSendRequest, searchUsers }: AddFriendModalProps) => {
  const { profile } = useAuth();
  const [screen, setScreen] = useState<Screen>("main");
  const [contactMethod, setContactMethod] = useState<ContactMethod>("email");
  const [searchValue, setSearchValue] = useState("");
  const [copied, setCopied] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<FriendProfile[]>([]);
  const [searched, setSearched] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setScreen("main");
      setSearchValue("");
      setCopied(false);
      setResults([]);
      setSearched(false);
    }, 200);
  };

  const handleBack = () => {
    setScreen("main");
    setSearchValue("");
    setResults([]);
    setSearched(false);
  };

  const inviteCode = profile?.invite_code || profile?.id?.slice(0, 8).toUpperCase() || "";

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleSearch = async () => {
    if (!searchValue.trim() || !searchUsers) return;
    setSearching(true);
    setSearched(false);
    const { results: r, error } = await searchUsers(searchValue.trim());
    setResults(r);
    setSearched(true);
    setSearching(false);
    if (error) {
      toast({ title: "Search failed", description: error, variant: "destructive" });
    }
  };

  const handleSendRequest = async (userId: string) => {
    if (!onSendRequest) return;
    setSendingTo(userId);
    const result = await onSendRequest(userId);
    setSendingTo(null);
    if (result.error) {
      toast({ title: "Could not send request", description: result.error, variant: "destructive" });
    } else {
      toast({ title: "Friend request sent!" });
      setResults((prev) => prev.filter((r) => r.id !== userId));
    }
  };

  const renderSearchResults = () => {
    if (searching) {
      return (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      );
    }
    if (searched && results.length === 0) {
      return (
        <p className="text-xs text-muted-foreground text-center py-4">
          No users found. Try a different search.
        </p>
      );
    }
    if (results.length > 0) {
      return (
        <div className="space-y-2 mt-3">
          {results.map((u) => {
            const initials = (u.display_name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
            return (
              <div key={u.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-secondary/40 border border-border/30">
                <Avatar className="h-9 w-9">
                  {u.avatar_url && <AvatarImage src={u.avatar_url} />}
                  <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.display_name}</p>
                  {u.invite_code && <p className="text-[10px] text-muted-foreground">#{u.invite_code}</p>}
                </div>
                <Button
                  size="sm"
                  className="rounded-lg h-8 text-xs"
                  disabled={sendingTo === u.id}
                  onClick={() => handleSendRequest(u.id)}
                >
                  {sendingTo === u.id ? <Loader2 size={12} className="animate-spin" /> : <><UserPlus size={12} className="mr-1" /> Add</>}
                </Button>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[400px] p-0 gap-0 rounded-2xl overflow-hidden border-border">
        <AnimatePresence mode="wait">
          {screen === "main" && (
            <motion.div key="main" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.15 }} className="p-6 pb-7">
              <h2 className="text-lg font-bold text-foreground mb-1">Add Friend</h2>
              <p className="text-xs text-muted-foreground mb-5">Choose how you'd like to connect</p>
              <div className="space-y-2.5">
                {OPTIONS.map((opt) => (
                  <button key={opt.key} onClick={() => setScreen(opt.key)} className="w-full flex items-center gap-3.5 p-3.5 rounded-xl bg-secondary/50 hover:bg-secondary border border-border/50 hover:border-border transition-all text-left group">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/15 transition-colors">
                      <opt.icon size={18} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{opt.hint}</p>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {screen === "qr" && (
            <motion.div key="qr" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.15 }} className="p-6 pb-7">
              <button onClick={handleBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors">
                <ArrowLeft size={14} /> Back
              </button>
              <h2 className="text-lg font-bold text-foreground mb-1">QR Code</h2>
              <p className="text-xs text-muted-foreground mb-5">Share your QR code or scan someone else's</p>
              <div className="flex flex-col items-center gap-3 mb-5">
                <div className="bg-white p-4 rounded-xl shadow-sm">
                  <QRCode value={inviteCode} size={160} level="M" bgColor="#ffffff" fgColor="#000000" />
                </div>
                <p className="text-xs text-muted-foreground">Your code</p>
                <button onClick={handleCopyCode} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-xs font-medium text-foreground hover:bg-secondary/80 transition-colors border border-border/50">
                  {copied ? <Check size={12} className="text-primary" /> : <Copy size={12} />}
                  {copied ? "Copied!" : inviteCode}
                </button>
              </div>
              <div className="border-t border-border pt-4">
                <Button variant="outline" className="w-full rounded-xl" onClick={() => alert("QR scanner coming soon! For now, ask your friend to share their code.")}>
                  <QrCode size={16} className="mr-2" />
                  Scan QR Code
                </Button>
              </div>
            </motion.div>
          )}

          {screen === "contacts" && (
            <motion.div key="contacts" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.15 }} className="p-6 pb-7">
              <button onClick={handleBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors">
                <ArrowLeft size={14} /> Back
              </button>
              <h2 className="text-lg font-bold text-foreground mb-1">Contacts</h2>
              <p className="text-xs text-muted-foreground mb-4">Find friends by email or phone number</p>
              <div className="flex gap-1 p-1 rounded-xl bg-secondary/60 mb-4">
                <button onClick={() => { setContactMethod("email"); setSearchValue(""); setResults([]); setSearched(false); }} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${contactMethod === "email" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  <Mail size={13} /> Email
                </button>
                <button onClick={() => { setContactMethod("phone"); setSearchValue(""); setResults([]); setSearched(false); }} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${contactMethod === "phone" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  <Phone size={13} /> Phone
                </button>
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={contactMethod === "email" ? "Enter email address" : "Enter phone number"}
                  type={contactMethod === "email" ? "email" : "tel"}
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-9 rounded-xl"
                />
              </div>
              <Button className="w-full mt-3 rounded-xl" disabled={!searchValue.trim() || searching} onClick={handleSearch}>
                {searching ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
                Search
              </Button>
              {renderSearchResults()}
            </motion.div>
          )}

          {screen === "id" && (
            <motion.div key="id" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.15 }} className="p-6 pb-7">
              <button onClick={handleBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors">
                <ArrowLeft size={14} /> Back
              </button>
              <h2 className="text-lg font-bold text-foreground mb-1">Search by ID</h2>
              <p className="text-xs text-muted-foreground mb-4">Enter a username or app ID to find someone</p>
              <div className="relative">
                <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Enter user ID or username"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-9 rounded-xl"
                />
              </div>
              <Button className="w-full mt-3 rounded-xl" disabled={!searchValue.trim() || searching} onClick={handleSearch}>
                {searching ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
                Search
              </Button>
              {renderSearchResults()}
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};

export default AddFriendModal;
