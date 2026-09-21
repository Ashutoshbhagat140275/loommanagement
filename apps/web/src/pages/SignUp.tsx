import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";

import { AuthLayout } from "@/components/AuthLayout.js";
import { Button } from "@/components/ui/button.js";
import { Field, FormError, Input } from "@/components/ui/field.js";
import { useSignUpFactory } from "@/lib/session.js";
import { useApiErrorMessage } from "@/lib/useApiErrorMessage.js";

export function SignUp() {
  const { t } = useTranslation();
  const signUp = useSignUpFactory();
  const toMessage = useApiErrorMessage();
  const [form, setForm] = useState({
    factoryName: "",
    ownerName: "",
    email: "",
    password: "",
  });

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    signUp.mutate({ ...form, email: form.email.trim() });
  };

  const fieldError = (name: string) =>
    signUp.error instanceof Error && "fields" in signUp.error
      ? (signUp.error.fields as Record<string, string[] | undefined> | undefined)?.[
          name
        ]?.[0]
      : undefined;

  return (
    <AuthLayout
      title={t("auth.signUp.title")}
      subtitle={t("auth.signUp.subtitle")}
      footer={
        <p className="text-slate-600">
          {t("auth.signUp.haveAccount")}{" "}
          <Link to="/sign-in" className="font-medium text-slate-900 underline">
            {t("auth.signUp.signIn")}
          </Link>
        </p>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <FormError>{signUp.error ? toMessage(signUp.error) : null}</FormError>

        <Field label={t("auth.signUp.factoryName")} error={fieldError("factoryName")}>
          {(props) => (
            <Input
              {...props}
              required
              value={form.factoryName}
              onChange={set("factoryName")}
            />
          )}
        </Field>

        <Field label={t("auth.signUp.ownerName")} error={fieldError("ownerName")}>
          {(props) => (
            <Input
              {...props}
              required
              autoComplete="name"
              value={form.ownerName}
              onChange={set("ownerName")}
            />
          )}
        </Field>

        <Field label={t("auth.signUp.email")} error={fieldError("email")}>
          {(props) => (
            <Input
              {...props}
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={set("email")}
            />
          )}
        </Field>

        <Field
          label={t("auth.signUp.password")}
          hint={t("auth.signUp.passwordHint")}
          error={fieldError("password")}
        >
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={form.password}
              onChange={set("password")}
            />
          )}
        </Field>

        <Button type="submit" block disabled={signUp.isPending}>
          {signUp.isPending ? t("common.loading") : t("auth.signUp.submit")}
        </Button>
      </form>
    </AuthLayout>
  );
}
