-- Marca de cada empresa (o sistema atende várias empresas, cada uma com a sua logo).
alter table empresas add column logo_url text;

-- Bucket público de logos. Caminho: <empresa_id>/logo-<versao>.png
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

create policy logos_admin_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and public.sou_admin()
              and (storage.foldername(name))[1] = public.minha_empresa()::text);
create policy logos_admin_trocar on storage.objects for update to authenticated
  using (bucket_id = 'logos' and public.sou_admin()
         and (storage.foldername(name))[1] = public.minha_empresa()::text);
create policy logos_admin_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and public.sou_admin()
         and (storage.foldername(name))[1] = public.minha_empresa()::text);
create policy logos_ler on storage.objects for select to authenticated
  using (bucket_id = 'logos');
