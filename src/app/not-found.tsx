import Link from "next/link";
import { Card, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <Card>
      <EmptyState icon="alert" title="الصفحة غير موجودة">
        <Link href="/" className="text-accent underline">
          ارجع للرئيسية
        </Link>
      </EmptyState>
    </Card>
  );
}
