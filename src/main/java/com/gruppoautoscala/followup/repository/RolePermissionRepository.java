package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.RolePermission;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface RolePermissionRepository extends JpaRepository<RolePermission, Long> {
    List<RolePermission> findAll();
    Optional<RolePermission> findByRoleAndSection(String role, String section);
}