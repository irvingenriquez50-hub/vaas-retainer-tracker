# VAAS Retainer Tracker — Web

App real con login de Google, cada persona ve solo sus contratos, y tú (admin) puedes ver todo.

## Subir a GitHub

1. Ve a tu repositorio en github.com/TU-USUARIO/vaas-retainer-tracker
2. Dale clic a "uploading an existing file"
3. Arrastra TODA esta carpeta (`vaas-web`) a la ventana del navegador — GitHub mantiene la estructura de carpetas
4. Escribe un mensaje como "primera version" y dale a "Commit changes"

## Conectar con Vercel

1. Ve a vercel.com y entra con tu cuenta de GitHub
2. Dale a "Add New" → "Project"
3. Busca `vaas-retainer-tracker` en la lista y dale "Import"
4. En "Environment Variables" agrega (los sacas de Supabase → Project Settings → API):
   - `NEXT_PUBLIC_SUPABASE_URL` = tu Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = tu clave "anon public"
5. Dale a "Deploy" y espera 1-2 minutos

## Después del primer deploy

1. Copia la URL que te da Vercel (algo como `vaas-retainer-tracker.vercel.app`)
2. En Google Cloud → tu cliente OAuth → agrega esa URL a "Authorized JavaScript origins" y `https://TU-URL/auth/callback` a "Authorized redirect URIs"
3. En Supabase → Authentication → URL Configuration → pon esa misma URL como "Site URL"

## Hacerte admin a ti mismo

1. Entra a la app con tu Google y regístrate normal (una vez)
2. Ve a Supabase → SQL Editor → corre esto (cambia el email por el tuyo):

```sql
update public.profiles set is_admin = true where email = 'irvingenriquez50@gmail.com';
```

3. Recarga la app — ahora vas a ver un ícono de escudo arriba a la derecha que te lleva al panel de admin

## Qué incluye esta primera versión

- Login con Google, datos privados por persona (RLS de Supabase)
- Dashboard: pipeline de retainers, tabs, agregar/editar contratos
- Panel de admin: ver todos los usuarios, cuánto han cerrado/cobrado, borrar datos de alguien

## Qué falta portar de la versión de Claude (fase 2)

- Selector de mes con navegación libre
- Panel de notas (escritos, links, notas libres)
- Badge de horario China/US
- Toggle de idioma ES/EN
- Papelera con restaurar / 30 días

Dime cuándo quieres que agreguemos cada una — el patrón para todas es el mismo: la lógica ya la tenemos en el archivo de Claude, solo hay que conectarla a Supabase igual que hicimos con el resto.
