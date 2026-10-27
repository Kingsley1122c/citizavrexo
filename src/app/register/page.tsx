import { AuthPanel } from "@/components/auth-panel";
import { registerAction } from "@/app/auth-actions";
export default function RegisterPage() { return <AuthPanel mode="register" action={registerAction}/>; }