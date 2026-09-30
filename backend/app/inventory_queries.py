from sqlalchemy import select

from app import models as m


def latest_run(connection_id, *, successful=False):
    query = select(m.SyncRun.id).where(m.SyncRun.connection_id == connection_id)
    if successful:
        query = query.where(m.SyncRun.status == "succeeded")
        query = query.order_by(m.SyncRun.finished_at.desc())
    return query.order_by(m.SyncRun.created_at.desc(), m.SyncRun.id.desc()).limit(1).correlate(m.CloudConnection)


def observed_resources(project_id):
    return (select(m.CloudResource, m.ResourceSnapshot, m.CloudConnection, m.SyncRun).select_from(m.CloudResource)
        .join(m.CloudConnection, m.CloudResource.connection_id == m.CloudConnection.id)
        .join(m.ResourceSnapshot, m.ResourceSnapshot.resource_id == m.CloudResource.id)
        .join(m.SyncRun, m.SyncRun.id == m.ResourceSnapshot.sync_run_id)
        .where(m.CloudConnection.project_id == project_id,
               m.ResourceSnapshot.sync_run_id == latest_run(m.CloudConnection.id, successful=True).scalar_subquery())
        .order_by(m.CloudResource.service_code, m.CloudResource.external_id, m.CloudResource.id))
