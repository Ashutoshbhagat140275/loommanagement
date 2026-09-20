import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { phoneSchema } from "@loom/shared";

import { AuthLayout } from "@/components/AuthLayout.js";
import { Button } from "@/components/ui/button.js";
import { Field, FormError, Input } from "@/components/ui/field.js";
import { useSignInWorker } from "@/lib/session.js";
import { useApiErrorMessage } from "@/lib/useApiErrorMessage.js";

export function WorkerSignIn() {
  const { t } = useTranslation();
  const signIn = useSignInWorker();
  const toMessage = useApiErrorMessage();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [phoneError, setPhoneError] = useState<string>();

  const submit = (event: FormEvent) => {
    event.preventDefault();

    // The server stores 10 bare digits, so normalise whatever they typed
    // (+91, spaces, a leading zero) before sending it as the username.
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) {
      setPhoneError(parsed.error.issues[0]?.message);
      return;
    }

    setPhoneError(undefined);
    signIn.mutate({ phone: parsed.data, pin });
  };

  return (
    <AuthLayout
      title={t("auth.worker.title")}
      subtitle={t("auth.worker.subtitle")}
      footer={
        <Link to="/sign-in" className="font-medium text-slate-900 underline">
          {t("auth.worker.asOwner")}
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <FormError>{toMessage(signIn.error)}</FormError>

        <Field label={t("auth.worker.phone")} error={phoneError}>
          {(props) => (
            <Input
              {...props}
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              required
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          )}
        </Field>

        <Field label={t("auth.worker.pin")}>
          {(props) => (
            <Input
              {...props}
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              required
              value={pin}
              onChange={(event) => setPin(event.target.value)}
            />
          )}
        </Field>

        <Button type="submit" block size="lg" disabled={signIn.isPending}>
          {signIn.isPending ? t("common.loading") : t("auth.worker.submit")}
        </Button>
      </form>
    </AuthLayout>
  );
}
