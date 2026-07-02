import { PrimaryNav } from "@/components/primary-nav";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#EFEDEA] text-black">
      <PrimaryNav className="bg-[#EFEDEA]" />
      {children}
    </div>
  );
}
