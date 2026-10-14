# Prueba controlada de AWS Security Hub

## Alcance aprobado

- Región única: `us-east-1`.
- Capacidad base: Security Hub Essentials.
- Integración de lectura desde CloudOps mediante `CloudOpsAuditRole`.
- Sin Threat Analytics, Extended, Lambda Code Scanning ni Network Scanning.
- Sin AWS Organizations y sin despliegue multirregión durante la prueba.

## Estado actual (2026-10-14)

- La cuenta `143924590537` está activa en el plan `PAID` y conserva USD 119.94 en créditos.
- Security Hub Essentials está habilitado únicamente en `us-east-1`.
- ARN: `arn:aws:securityhub:us-east-1:143924590537:hubv2/da7b38bc-e1ee-4dbb-871b-e3529706b4de`.
- La prueba gratuita comenzó el 2026-10-14 y vence el 2026-11-13 a las 07:33:02 UTC.
- No hay características opt-in habilitadas.
- AWS Config creó tres recorders administrados con alcance `INTERNAL`: activos regionales, activos globales y CSPM.
- Amazon Inspector permanece desactivado porque no existen recursos EC2, ECR o Lambda que requieran cobertura.
- Security Hub CSPM está habilitado exclusivamente con AWS Foundational Security Best Practices v1.0.0 y su estado es `READY`; CIS y los demás estándares permanecen desactivados.

AWS indica que los créditos restantes se mantienen al cambiar directamente de plan;
crear o unirse a AWS Organizations puede provocar la pérdida de los créditos y no
forma parte de este procedimiento.

Referencia: https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-FAQ.html

## Activación después de autorizar el plan de pago

La identidad administrativa se usa solo para el alta inicial. CloudOps continúa
operando con el rol temporal de auditoría.

```powershell
aws securityhub enable-security-hub-v2 `
  --profile cloudops-root `
  --region us-east-1 `
  --tags ManagedBy=CloudOps,Purpose=SecurityAssessment
```

No ejecutar `enable-security-hub-feature-v2`: ese comando habilita capacidades
opcionales y queda fuera del alcance de la prueba.

## Verificación

```powershell
aws securityhub describe-security-hub-v2 `
  --profile cloudops-audit `
  --region us-east-1

aws securityhub get-findings-v2 `
  --profile cloudops-audit `
  --region us-east-1 `
  --max-results 10

aws configservice list-configuration-recorders `
  --profile cloudops-audit `
  --region us-east-1

aws inspector2 list-coverage `
  --profile cloudops-audit `
  --region us-east-1 `
  --max-results 10
```

La respuesta de `describe-security-hub-v2` debe mostrar el ARN y la fecha de alta.
La lista de `Features` debe permanecer sin complementos opt-in. AWS Config debe mostrar
los recorders internos administrados por Security Hub cuando termine el aprovisionamiento.

## Baja

```powershell
aws securityhub disable-security-hub-v2 `
  --profile cloudops-root `
  --region us-east-1
```

Antes de dar de baja se exporta el informe del cliente. Al deshabilitar Security Hub se
pierde el acceso a sus hallazgos, integraciones y configuración. Después se verifica que
no queden recorders o analizadores asociados y se revisa Cost Explorer cuando AWS haya
actualizado los datos de facturación.

Referencia: https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-v2-disable.html
