import { useTranslation } from "react-i18next";

import { ApiError } from "./api.js";

/** Turn an ApiError into something a person can act on, in their language. */
export function useApiErrorMessage() {
  const { t } = useTranslation();

  return (error: unknown): string | undefined => {
    if (!error) return undefined;
    if (!(error instanceof ApiError)) return t("auth.errors.offline");

    if (error.code === "OFFLINE") return t("auth.errors.offline");
    if (error.code === "EMAIL_TAKEN") return t("auth.errors.emailTaken");
    // The server's own wording for these carries raw paise; say it properly.
    if (error.code === "CUT_MORE_THAN_ADVANCE") {
      return t("passbook.errors.CUT_MORE_THAN_ADVANCE");
    }
    if (error.code === "SETTLE_MORE_THAN_OWED") {
      return t("passbook.errors.SETTLE_MORE_THAN_OWED");
    }
    if (error.code === "NOT_ENOUGH_STOCK") return t("stock.errors.NOT_ENOUGH_STOCK");
    if (error.code === "RETURN_MORE_THAN_GIVEN") {
      return t("stock.errors.RETURN_MORE_THAN_GIVEN");
    }
    if (error.status === 401) return t("auth.errors.invalidCredentials");

    // Field-level problems are shown next to the field; if we got here the
    // server did not say which field, so show its message as it came.
    return error.message;
  };
}
