import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // หน้านำเข้าข้อมูลส่งเนื้อไฟล์ CSV เข้า Server Action โดยตรง
      // ค่าเริ่มต้น 1MB น้อยเกินไปสำหรับ export จาก POS ที่มีหลายหมื่นบรรทัด
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
