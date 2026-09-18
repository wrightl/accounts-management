import { SignUp } from "@clerk/nextjs";
import { AuthFrame } from "@/components/brand/auth-frame";

export default function SignUpPage() {
  return (
    <AuthFrame>
      <SignUp />
    </AuthFrame>
  );
}
