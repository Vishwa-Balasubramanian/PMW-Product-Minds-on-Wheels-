import Link from "next/link";
import type { VehicleCard } from "@/lib/gate";

const MODELS = [
  { code: "G70", photo: "/cars/G70-wide.jpg", position: "50% 56%" },
  { code: "G60", photo: "/cars/G60/front.jpg", position: "50% 76%" },
  { code: "F70", photo: "/cars/F70-wide.jpg", position: "50% 65%" },
];

/** Real supplied photography. Only the Requirements view includes this model switcher. */
export function RequirementModels({ vehicles, selected }: { vehicles: VehicleCard[]; selected: string }) {
  return (
    <nav aria-label="Requirement vehicles" className="grid grid-cols-3 gap-px bg-line" data-testid="requirement-models">
      {MODELS.map((model) => {
        const vehicle = vehicles.find((v) => v.code === model.code);
        if (!vehicle) return null;
        const current = selected === model.code;
        const content = (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={model.photo} alt="" className={`absolute inset-0 h-full w-full object-cover ${vehicle.available ? "" : "grayscale"}`} style={{ objectPosition: model.position }} />
            <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
            <span className="relative flex flex-col gap-0.5 px-3 pb-3 pt-14 sm:px-5 sm:pb-4">
              <span className="text-[14px] font-medium leading-tight sm:text-[20px]">{vehicle.short} <span className="hidden text-[13px] font-normal text-white/80 sm:inline">/ {vehicle.code}</span></span>
              {!vehicle.available && <span className="text-[11px] leading-tight text-white/85 sm:text-[12px]">Not sold in your region</span>}
            </span>
          </>
        );
        const style = `relative isolate flex h-[132px] min-w-0 items-end overflow-hidden border-b-[3px] bg-night text-white sm:h-[190px] lg:h-[210px] ${current ? "border-blue" : "border-transparent"}`;
        return vehicle.available ? (
          <Link key={model.code} href={`/vehicles/${model.code}`} aria-current={current ? "page" : undefined} className={`${style} hover:border-blue focus-visible:z-10 focus-visible:outline-offset-[-4px]`}>
            {content}
          </Link>
        ) : (
          <span key={model.code} className={style} aria-disabled="true">{content}</span>
        );
      })}
    </nav>
  );
}
