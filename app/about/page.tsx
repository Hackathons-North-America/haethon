import { AboutScrollShowcase } from "@/components/about-scroll-showcase";
import { PrimaryNav } from "@/components/primary-nav";

export default function AboutPage() {
  return (
    <main className="min-h-screen overflow-x-clip bg-[#EFEDEA] text-black">
      <PrimaryNav activeHref="/about" className="bg-[#EFEDEA]/95 backdrop-blur" />

      <section className="px-5 pb-16 pt-20 sm:px-8 sm:pb-20 sm:pt-24 lg:px-12">
        <div className="mx-auto max-w-[1180px]">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-[#660000]">
            About HNA
          </p>
          <h1 className="mt-5 max-w-[880px] text-[2.55rem] font-semibold leading-[1.02] tracking-normal text-black sm:text-6xl lg:text-7xl">
            We build the hackathon ecosystem we wanted as students.
          </h1>
          <p className="mt-7 max-w-[680px] text-base leading-7 text-[#3F3E3B] sm:text-lg">
            HNA brings together our flagship event, organizer support, and
            a North American discovery layer for hackers looking for the next
            place to build.
          </p>
        </div>
      </section>

      <AboutScrollShowcase />
    </main>
  );
}
