import { createClient } from "@supabase/supabase-js";

const EMAIL = "cryptojuan6@gmail.com";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function deleteUser() {
  // 1. Buscar en public.users
  const { data: publicUser, error: findError } = await supabase
    .from("users")
    .select("id")
    .eq("email", EMAIL)
    .single();

  let userId = publicUser?.id;

  if (findError || !userId) {
    console.log("No encontrado en public.users, buscando en auth.users...");

    const { data, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) { console.error(listError.message); process.exit(1); }

    const authUser = data.users.find((u) => u.email === EMAIL);
    if (!authUser) {
      console.log("Usuario no encontrado en ninguna tabla. Nada que borrar.");
      process.exit(0);
    }
    userId = authUser.id;
  } else {
    // 2. Borrar de public.users
    const { error: deletePublicError } = await supabase
      .from("users")
      .delete()
      .eq("id", userId);

    if (deletePublicError) {
      console.error("Error borrando de public.users:", deletePublicError.message);
      process.exit(1);
    }
    console.log(`Borrado de public.users: ${userId}`);
  }

  // 3. Borrar de auth.users
  const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId);
  if (deleteAuthError) {
    console.error("Error borrando de auth.users:", deleteAuthError.message);
    process.exit(1);
  }
  console.log(`Borrado de auth.users: ${userId}`);
  console.log("Listo. El usuario puede registrarse como nuevo.");
}

deleteUser();
