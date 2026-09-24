import { RiderApiError } from "./api";

export function acceptErrorMessage(error: unknown) {
  if (!(error instanceof RiderApiError))
    return "Porosia nuk u pranua. Rifresko ofertat dhe provo përsëri.";

  switch (error.code) {
    case "RIDER_ORDER_CAPACITY_REACHED":
      return "Ke dy porosi aktive. Përfundo një dorëzim para se të pranosh një tjetër.";
    case "SECOND_ORDER_REQUIRES_PICKUP":
      return "Porosinë e dytë mund ta pranosh vetëm pasi të marrësh të parën nga biznesi.";
    case "SECOND_ORDER_SAME_BUSINESS":
      return "Porosia e dytë duhet të vijë nga një biznes tjetër.";
    case "SECOND_ORDER_BUSINESS_TOO_FAR":
      return "Dy bizneset janë më larg se 500 m nga njëri-tjetri.";
    case "SECOND_ORDER_DESTINATION_TOO_FAR":
      return "Dy destinacionet janë më larg se 500 m nga njëri-tjetri.";
    default:
      return "Porosia u mor nga dikush tjetër ose oferta skadoi.";
  }
}
