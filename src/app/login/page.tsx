import { AuthPanel } from "@/components/auth-panel";
import { loginAction } from "@/app/auth-actions";
export default function LoginPage() { return <AuthPanel mode="login" action={loginAction}/>; }