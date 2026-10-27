import { AuthPanel } from "@/components/auth-panel";
import { resetAction } from "@/app/auth-actions";
export default function ForgotPasswordPage() { return <AuthPanel mode="reset" action={resetAction}/>; }