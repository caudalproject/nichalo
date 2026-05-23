import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });

import { createSupabaseServiceClient } from "../lib/supabase-service";

const EMAIL = "cryptojuan6@gmail.com";

async function deleteUser() {
  const supabase = createSupabaseServiceClient();

  const { data: publicUser, error: findError } = await supabase
    .from("users")
    .select("id")
    .eq("email", EMAIL)
    .single();

  if (findError || !publicUser) {
    console.log(`Usuario no encontrado en public.users: ${findError?.message}`);
  } else {
    const { error: deletePublicError } = await supabase
      .from("users")
      .delete()
      .eq("id", publicUser.id);

    if (deletePublicError) {
      console.error("Error borrando de public.users:", deletePublicError.message);
      process.exit(1);
    }
    console.log(`Borrado de public.users: ${publicUser.id}`);

    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(publicUser.id);

    if (deleteAuthError) {
      console.error("Error borrando de auth.users:", deleteAuthError.message);
      process.exit(1);
    }
    console.log(`Borrado de auth.users: ${publicUser.id}`);
  }

  // Fallback: buscar directo en auth si no estaba en public.users
  if (!publicUser) {
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) { console.error(listError.message); process.exit(1); }

    const authUser = users.find((u) => u.email === EMAIL);
    if (!authUser) {
      console.log("Usuario no encontrado en auth.users tampoco. Nada que borrar.");
      process.exit(0);
    }

    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(authUser.id);
    if (deleteAuthError) {
      console.error("Error borrando de auth.users:", deleteAuthError.message);
      process.exit(1);
    }
    console.log(`Borrado de auth.users (solo): ${authUser.id}`);
  }

  console.log("Listo. El usuario puede registrarse como nuevo.");
}

deleteUser();
