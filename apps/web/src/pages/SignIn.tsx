import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";

import { AuthLayout } from "@/components/AuthLayout.js";
import { Button } from "@/components/ui/button.js";
import { Field, FormError, Input } from "@/components/ui/field.js";
import { useSignInOwner } from "@/lib/session.js";
import { useApiErrorMessage } from "@/lib/useApiErrorMessage.js";

export function SignIn() {
  const { t } = useTranslation();
  const signIn = useSignInOwner();
  const toMessage = useApiErrorMessage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    signIn.mutate({ email: email.trim(), password });
  };

  return (
    <AuthLayout
      title={t("auth.signIn.title")}
      subtitle={t("auth.signIn.subtitle")}
      footer={
        <p className="text-slate-600">
          {t("auth.signIn.noAccount")}{" "}
          <Link to="/sign-up" className="font-medium text-slate-900 underline">
            {t("auth.signIn.createFactory")}
          </Link>
        </p>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <FormError>{toMessage(signIn.error)}</FormError>

        <Field label={t("auth.signIn.email")}>
          {(props) => (
            <Input
              {...props}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>

        <Field label={t("auth.signIn.password")}>
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>

        <Button type="submit" block disabled={signIn.isPending}>
          {signIn.isPending ? t("common.loading") : t("auth.signIn.submit")}
        </Button>

        <Link
          to="/sign-in/worker"
          className="block pt-2 text-center text-sm font-medium text-slate-600 underline"
        >
          {t("auth.signIn.asWorker")}
        </Link>
      </form>
    </AuthLayout>
  );
}
