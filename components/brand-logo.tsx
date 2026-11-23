import Image from "next/image";

/* The beaver + "HNA" wordmark shared by the landing nav, the app top nav, and
   the admin/organizer sidebars. Callers wrap it in their own Link, since each
   header points somewhere different. The SVG serves as-is (Next skips
   optimization for .svg). */
export function BrandLogo() {
  return (
    <span className="flex items-center gap-2.5">
      <Image alt="" className="h-8 w-auto" height={677} priority src="/logo-beaver.svg" width={613} />
      <span className="whitespace-nowrap text-2xl font-semibold leading-none tracking-tight text-ink">HNA</span>
    </span>
  );
}
